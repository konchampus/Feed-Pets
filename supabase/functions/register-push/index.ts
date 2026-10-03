import { createClient } from 'npm:@supabase/supabase-js@2';
import { createApiKeyFetch, getPublishableKey, getSecretKey } from '../_shared/api-keys.ts';
import { serveWithCors } from '../_shared/cors.ts';

serveWithCors(async (request) => {
	if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
	const authHeader = request.headers.get('Authorization');
	if (!authHeader) return Response.json({ error: 'Authentication required' }, { status: 401 });
	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const publishableKey = getPublishableKey();
	const client = createClient(supabaseUrl, publishableKey, { global: { fetch: createApiKeyFetch(publishableKey), headers: { Authorization: authHeader } }, auth: { persistSession: false } });
	const { data: { user } } = await client.auth.getUser();
	if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
	const { subscription } = await request.json();
	if (typeof subscription?.endpoint !== 'string' || subscription.endpoint.length > 2048 || typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') return Response.json({ error: 'Invalid push subscription' }, { status: 400 });
	let endpointHost = '';
	try { const endpoint = new URL(subscription.endpoint); if (endpoint.protocol !== 'https:') throw new Error(); endpointHost = endpoint.hostname.toLowerCase(); }
	catch { return Response.json({ error: 'Invalid push subscription' }, { status: 400 }); }
	const trustedHosts = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com'];
	if (!trustedHosts.some((host) => endpointHost === host || endpointHost.endsWith(`.${host}`))) return Response.json({ error: 'Unsupported push provider' }, { status: 400 });
	if (typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') return Response.json({ error: 'Invalid push subscription' }, { status: 400 });
	const secretKey = getSecretKey();
	const admin = createClient(supabaseUrl, secretKey, { global: { fetch: createApiKeyFetch(secretKey) }, auth: { persistSession: false } });
	const { error } = await admin.from('push_subscriptions').upsert({ user_id: user.id, endpoint: subscription.endpoint, subscription, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' });
	if (error) return Response.json({ error: 'Could not save subscription' }, { status: 400 });
	return Response.json({ saved: true }, { status: 201 });
});
