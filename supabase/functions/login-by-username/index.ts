import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
const encoder = new TextEncoder();

async function hashValue(value: string) {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
	if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
	if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: jsonHeaders });

	const genericError = () => Response.json({ error: 'Invalid username or password' }, { status: 401, headers: jsonHeaders });
	try {
		const { username, password } = await request.json();
		if (typeof username !== 'string' || typeof password !== 'string' || password.length > 128 || !/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return genericError();

		const supabaseUrl = Deno.env.get('SUPABASE_URL');
		const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
		if (!supabaseUrl || !serviceRoleKey) return Response.json({ error: 'Server is not configured' }, { status: 500, headers: jsonHeaders });
		const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
		const forwardedIps = request.headers.get('x-forwarded-for')?.split(',').map((ip) => ip.trim()) ?? [];
		const clientIp = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-real-ip') ?? forwardedIps.at(-1) ?? '';
		const usernameBucket = await hashValue(`${clientIp}:${username.toLowerCase()}`);
		const { data: usernameAllowed, error: usernameLimitError } = await admin.rpc('consume_login_attempt', { attempt_hash: usernameBucket, max_attempts: 10 });
		if (usernameLimitError) return Response.json({ error: 'Login is temporarily unavailable' }, { status: 503, headers: jsonHeaders });
		if (!usernameAllowed) return Response.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429, headers: jsonHeaders });
		if (clientIp) {
			const ipBucket = await hashValue(`ip:${clientIp}`);
			const { data: ipAllowed, error: ipLimitError } = await admin.rpc('consume_login_attempt', { attempt_hash: ipBucket, max_attempts: 50 });
			if (ipLimitError) return Response.json({ error: 'Login is temporarily unavailable' }, { status: 503, headers: jsonHeaders });
			if (!ipAllowed) return Response.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429, headers: jsonHeaders });
		}

		const { data: profile } = await admin.from('profiles').select('user_id').eq('username', username.toLowerCase()).maybeSingle();
		if (!profile) {
			await createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false } }).auth.signInWithPassword({ email: 'unknown-account@invalid.lapki.local', password });
			return genericError();
		}
		const { data: userResult } = await admin.auth.admin.getUserById(profile.user_id);
		const email = userResult.user?.email;
		if (!email) { await hashValue(password); return genericError(); }
		const { data, error } = await createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
		if (error || !data.session) return genericError();
		return Response.json({ session: data.session }, { headers: jsonHeaders });
	} catch {
		return genericError();
	}
});
