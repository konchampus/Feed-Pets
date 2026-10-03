import { createClient } from 'npm:@supabase/supabase-js@2';
import { createApiKeyFetch, getPublishableKey, getSecretKey } from '../_shared/api-keys.ts';
import { serveWithCors } from '../_shared/cors.ts';

serveWithCors(async (request) => {
	if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const publishableKey = getPublishableKey();
	const authHeader = request.headers.get('Authorization');
	if (!authHeader) return Response.json({ error: 'Authentication required' }, { status: 401 });
	const client = createClient(supabaseUrl, publishableKey, { global: { fetch: createApiKeyFetch(publishableKey), headers: { Authorization: authHeader } }, auth: { persistSession: false } });
	const { data: { user } } = await client.auth.getUser();
	if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
	const { token } = await request.json();
	if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return Response.json({ error: 'Invite is invalid or expired' }, { status: 400 });
	const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), (byte) => byte.toString(16).padStart(2, '0')).join('');
	const secretKey = getSecretKey();
	const admin = createClient(supabaseUrl, secretKey, { global: { fetch: createApiKeyFetch(secretKey) }, auth: { persistSession: false } });
	const { data: familyId, error } = await admin.rpc('redeem_family_invite', { invite_hash: tokenHash, joining_user: user.id, joining_email: user.email ?? '' });
	if (error || !familyId) return Response.json({ error: 'Invite is invalid or expired' }, { status: 400 });
	return Response.json({ familyId });
});
