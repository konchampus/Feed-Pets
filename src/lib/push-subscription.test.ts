import { describe, expect, it, vi } from 'vitest';
import { removePushSubscription } from './push-subscription';

describe('removing a push subscription', () => {
	it('unsubscribes this device even if the server is offline', async () => {
		const calls: string[] = [];
		const subscription = { endpoint: 'https://push.example/device-1', unsubscribe: vi.fn(async () => { calls.push('device'); return true; }) };
		const removeFromServer = vi.fn(async () => { calls.push('server'); throw new Error('offline'); });
		const onDeviceRemoved = vi.fn(() => calls.push('state'));

		await expect(removePushSubscription(subscription, removeFromServer, onDeviceRemoved)).resolves.toEqual({ deviceRemoved: true, serverRemoved: false });
		expect(calls).toEqual(['device', 'state', 'server']);
	});

	it('still removes the server row when the browser cannot unsubscribe', async () => {
		const subscription = { endpoint: 'https://push.example/device-1', unsubscribe: vi.fn(async () => false) };
		const removeFromServer = vi.fn(async () => true);

		await expect(removePushSubscription(subscription, removeFromServer, vi.fn())).resolves.toEqual({ deviceRemoved: false, serverRemoved: true });
		expect(removeFromServer).toHaveBeenCalledWith(subscription.endpoint);
	});
});
