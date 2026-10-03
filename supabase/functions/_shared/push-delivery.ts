type Subscription = { id: string };

export function isExpiredPushError(error: unknown) {
	return typeof error === 'object' && error !== null && 'statusCode' in error
		&& (error.statusCode === 404 || error.statusCode === 410);
}

export async function sendPendingPushes<T extends Subscription>(
	subscriptions: T[],
	deliveredIds: string[],
	send: (subscription: T) => Promise<void>,
	markDelivered: (subscriptionId: string) => Promise<void>,
	removeSubscription: (subscription: T) => Promise<boolean>
) {
	const delivered = new Set(deliveredIds);
	const failedDeliveries: unknown[] = [];
	await Promise.all(subscriptions.filter((subscription) => !delivered.has(subscription.id)).map(async (subscription) => {
		try {
			await send(subscription);
		} catch (error) {
			if (isExpiredPushError(error)) {
				try {
					const removed = await removeSubscription(subscription);
					if (!removed) failedDeliveries.push(new Error('Push subscription changed during cleanup'));
				}
				catch (removeError) { failedDeliveries.push(removeError); }
			} else failedDeliveries.push(error);
			return;
		}
		try { await markDelivered(subscription.id); }
		catch (error) { failedDeliveries.push(error); }
	}));
	if (failedDeliveries.length) throw new Error(`Push delivery failed for ${failedDeliveries.length} subscription(s)`);
}
