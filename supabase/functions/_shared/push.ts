import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

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
	payload: { title: string; body: string; url: string; tag: string }
) {
	let memberQuery = admin.from('family_members').select('user_id').eq('family_id', familyId);
	if (actorId) memberQuery = memberQuery.neq('user_id', actorId);
	const { data: members, error: memberError } = await memberQuery;
	if (memberError) throw memberError;
	const userIds = (members ?? []).map((member) => member.user_id);
	if (!userIds.length) return;
	const { data: subscriptions, error: subscriptionError } = await admin
		.from('push_subscriptions').select('id, subscription').in('user_id', userIds);
	if (subscriptionError) throw subscriptionError;
	const failedDeliveries: unknown[] = [];
	await Promise.all((subscriptions ?? []).map(async (row) => {
		try {
			await push.sendNotification(row.subscription, JSON.stringify(payload));
		} catch (error) {
			if (typeof error === 'object' && error !== null && 'statusCode' in error && (error.statusCode === 404 || error.statusCode === 410)) {
				const { error: deleteError } = await admin.from('push_subscriptions').delete().eq('id', row.id);
				if (deleteError) failedDeliveries.push(deleteError);
			} else failedDeliveries.push(error);
		}
	}));
	if (failedDeliveries.length) throw new Error(`Push delivery failed for ${failedDeliveries.length} subscription(s)`);
	return (subscriptions ?? []).length;
}
