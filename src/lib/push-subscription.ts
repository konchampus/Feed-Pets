export type PushSubscriptionHandle = {
	endpoint: string;
	unsubscribe: () => Promise<boolean>;
};

export type PushRemovalResult = { deviceRemoved: boolean; serverRemoved: boolean };

export async function removePushSubscription(
	subscription: PushSubscriptionHandle,
	removeFromServer: (endpoint: string) => Promise<boolean>,
	onDeviceRemoved: () => void
): Promise<PushRemovalResult> {
	let deviceRemoved = false;
	try { deviceRemoved = await subscription.unsubscribe(); } catch { /* Still try to stop server delivery. */ }
	if (deviceRemoved) onDeviceRemoved();

	try {
		return { deviceRemoved, serverRemoved: await removeFromServer(subscription.endpoint) };
	} catch {
		return { deviceRemoved, serverRemoved: false };
	}
}
