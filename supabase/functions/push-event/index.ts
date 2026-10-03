import { createClient } from 'npm:@supabase/supabase-js@2';
import { makePushClient, sendFamilyPush } from '../_shared/push.ts';
import { serveWithCors } from '../_shared/cors.ts';

serveWithCors(async (request) => {
	if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
	const authHeader = request.headers.get('Authorization');
	if (!authHeader) return Response.json({ error: 'Authentication required' }, { status: 401 });
	const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
	const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
	const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
	const { data: { user } } = await client.auth.getUser();
	if (!user) return Response.json({ error: 'Authentication required' }, { status: 401 });
	const { eventId } = await request.json();
	if (typeof eventId !== 'string') return Response.json({ error: 'Event is required' }, { status: 400 });
	const { data: event } = await client.from('care_events').select('id,family_id,author_id,actor_name,kind,amount,unit,pets(name)').eq('id', eventId).maybeSingle();
	if (!event) return Response.json({ error: 'Event not found' }, { status: 404 });
	if (event.author_id !== user.id) return Response.json({ error: 'Only the event author can notify family members' }, { status: 403 });
	const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
	const { data: claimed, error: claimError } = await admin.rpc('claim_care_event_push', { target_event: event.id, requesting_user: user.id });
	if (claimError) return Response.json({ error: 'Could not prepare notification' }, { status: 500 });
	if (typeof claimed !== 'string') {
		const { data: delivery, error: statusError } = await admin.from('care_event_pushes').select('claimed_at,sent_at').eq('event_id', event.id).maybeSingle();
		if (statusError) return Response.json({ error: 'Could not check notification status' }, { status: 500 });
		if (!delivery) return Response.json({ error: 'Only the event author can notify family members' }, { status: 403 });
		if (delivery.sent_at) return Response.json({ sent: false, reason: 'already-sent' });
		const retryAfter = Math.max(1, Math.ceil((new Date(delivery.claimed_at).getTime() + 180_000 - Date.now()) / 1000));
		return Response.json({ error: 'Notification is already being sent' }, { status: 409, headers: { 'Retry-After': String(retryAfter) } });
	}
	const dogName = (event.pets as { name?: string } | null)?.name ?? 'собака';
	const amount = event.amount ? `, ${event.amount} ${event.unit ?? ''}` : '';
	const payload = { title: 'Новое в Лапках', body: `${event.actor_name}: ${event.kind}${amount} — ${dogName}`, url: './', tag: `care-${event.id}` };
	try {
		const { data: receipts, error: deliveryError } = await admin.from('push_delivery_receipts').select('subscription_id').eq('event_id', event.id);
		if (deliveryError) throw deliveryError;
		await sendFamilyPush(admin, makePushClient(), event.family_id, user.id, payload, {
			deliveredSubscriptionIds: (receipts ?? []).map((receipt) => receipt.subscription_id),
			markDelivered: async (subscriptionId) => {
				const { data: recorded, error } = await admin.rpc('record_care_event_push_delivery', {
					target_event: event.id,
					claim_token: claimed,
					target_subscription: subscriptionId
				});
				if (error || !recorded) throw error ?? new Error('Push claim is no longer active');
			}
		});
		const { data: completed, error } = await admin.rpc('complete_care_event_push', { target_event: event.id, claim_token: claimed });
		if (error || !completed) throw error ?? new Error('Push claim is no longer active');
	} catch {
		await admin.rpc('release_care_event_push', { target_event: event.id, claim_token: claimed });
		return Response.json({ error: 'Push delivery failed' }, { status: 503 });
	}
	return Response.json({ sent: true });
});
