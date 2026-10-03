import { describe, expect, it } from 'vitest';
import { sendPendingPushes } from './push-delivery';

describe('sendPendingPushes', () => {
	it('retries only subscriptions without a saved delivery receipt', async () => {
		const subscriptions = [{ id: 'phone-a' }, { id: 'phone-b' }, { id: 'phone-c' }];
		const deliveredIds: string[] = [];
		const sentIds: string[] = [];
		let shouldFail = true;
		const send = async ({ id }: { id: string }) => {
			sentIds.push(id);
			if (id === 'phone-b' && shouldFail) throw new Error('Temporary push error');
		};
		const markDelivered = async (id: string) => { deliveredIds.push(id); };
		const removeSubscription = async () => true;

		await expect(sendPendingPushes(subscriptions, deliveredIds, send, markDelivered, removeSubscription)).rejects.toThrow('1 subscription(s)');
		expect(deliveredIds.sort()).toEqual(['phone-a', 'phone-c']);
		expect(sentIds.sort()).toEqual(['phone-a', 'phone-b', 'phone-c']);

		shouldFail = false;
		sentIds.length = 0;
		await sendPendingPushes(subscriptions, deliveredIds, send, markDelivered, removeSubscription);
		expect(sentIds).toEqual(['phone-b']);
		expect(deliveredIds.sort()).toEqual(['phone-a', 'phone-b', 'phone-c']);
	});

	it.each([404, 410])('removes expired subscriptions with status %i without failing the remaining delivery', async (statusCode) => {
		const removedIds: string[] = [];
		const deliveredIds: string[] = [];
		await sendPendingPushes(
			[{ id: 'expired-phone' }, { id: 'active-phone' }],
			[],
			async ({ id }) => { if (id === 'expired-phone') throw { statusCode }; },
			async (id) => { deliveredIds.push(id); },
			async (subscription) => { removedIds.push(subscription.id); return true; }
		);
		expect(removedIds).toEqual(['expired-phone']);
		expect(deliveredIds).toEqual(['active-phone']);
	});

	it('does not remove a subscription when saving its receipt fails', async () => {
		const removedIds: string[] = [];
		await expect(sendPendingPushes(
			[{ id: 'active-phone' }],
			[],
			async () => {},
			async () => { throw { statusCode: 410 }; },
			async (subscription) => { removedIds.push(subscription.id); return false; }
		)).rejects.toThrow('1 subscription(s)');
		expect(removedIds).toEqual([]);
	});

	it('retries when a stale endpoint belongs to an updated subscription', async () => {
		const removedIds: string[] = [];
		await expect(sendPendingPushes(
			[{ id: 'refreshed-phone' }],
			[],
			async () => { throw { statusCode: 410 }; },
			async () => {},
			async (subscription) => { removedIds.push(subscription.id); return false; }
		)).rejects.toThrow('1 subscription(s)');
		expect(removedIds).toEqual(['refreshed-phone']);
	});
});
