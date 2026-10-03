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
	const { familyId, email } = await request.json();
	if (typeof familyId !== 'string' || (email !== undefined && (typeof email !== 'string' || email.length > 254))) return Response.json({ error: 'Invalid invite details' }, { status: 400 });
	const { data: membership } = await client.from('family_members').select('role').eq('family_id', familyId).eq('user_id', user.id).maybeSingle();
	if (membership?.role !== 'owner') return Response.json({ error: 'Family owner access required' }, { status: 403 });
	const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
	const token = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
	const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), (byte) => byte.toString(16).padStart(2, '0')).join('');
	const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
	const secretKey = getSecretKey();
	const admin = createClient(supabaseUrl, secretKey, { global: { fetch: createApiKeyFetch(secretKey) }, auth: { persistSession: false } });
	const { error } = await admin.from('family_invites').insert({ family_id: familyId, invited_by: user.id, invited_email: typeof email === 'string' ? email.toLowerCase() : null, token_hash: tokenHash, expires_at: expiresAt });
	if (error) return Response.json({ error: 'Could not create invite' }, { status: 400 });
	return Response.json({ token, expiresAt }, { status: 201 });
});
