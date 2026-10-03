import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { sendPendingPushes } from './push-delivery.ts';

type PushDeliveryState = {
	deliveredSubscriptionIds: string[];
	markDelivered: (subscriptionId: string) => Promise<void>;
};

export function makePushClient() {
	const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
	const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
	const subject = Deno.env.get('VAPID_SUBJECT');
	if (!publicKey || !privateKey || !subject) throw new Error('Push is not configured');
	webpush.setVapidDetails(subject, publicKey, privateKey);
	return webpush;
}

export async function sendFamilyPush(
	admin: SupabaseClient,
	push: ReturnType<typeof makePushClient>,
	familyId: string,
	actorId: string | null,
	payload: { title: string; body: string; url: string; tag: string },
	deliveryState?: PushDeliveryState
) {
	let memberQuery = admin.from('family_members').select('user_id').eq('family_id', familyId);
	if (actorId) memberQuery = memberQuery.neq('user_id', actorId);
	const { data: members, error: memberError } = await memberQuery;
	if (memberError) throw memberError;
	const userIds = (members ?? []).map((member) => member.user_id);
	if (!userIds.length) return;
	const { data: subscriptions, error: subscriptionError } = await admin
		.from('push_subscriptions').select('id, endpoint, subscription, updated_at').in('user_id', userIds);
	if (subscriptionError) throw subscriptionError;
	await sendPendingPushes(
		subscriptions ?? [],
		deliveryState?.deliveredSubscriptionIds ?? [],
		async (row) => { await push.sendNotification(row.subscription, JSON.stringify(payload)); },
		async (subscriptionId) => {
			if (deliveryState) await deliveryState.markDelivered(subscriptionId);
		},
		async (subscription) => {
			const { data: deletedSubscriptions, error: deleteError } = await admin.from('push_subscriptions').delete().eq('id', subscription.id)
				.eq('endpoint', subscription.endpoint).eq('updated_at', subscription.updated_at).select('id');
			if (deleteError) throw deleteError;
			if (deletedSubscriptions?.length) return true;
			const { data: currentSubscription, error: checkError } = await admin.from('push_subscriptions').select('id').eq('id', subscription.id).maybeSingle();
			if (checkError) throw checkError;
			return !currentSubscription;
		}
	);
	return (subscriptions ?? []).length;
}
