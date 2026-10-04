import { describe, expect, it } from 'vitest';
import { fetchAllPages } from './paginated-query';

describe('fetchAllPages', () => {
	it('loads more than 1000 rows in bounded pages without skipping records', async () => {
		const schedules = Array.from({ length: 1_205 }, (_, index) => ({ id: String(index + 1).padStart(4, '0') }));
		const pageRequests: Array<{ afterId: string | null; pageSize: number }> = [];

		const result = await fetchAllPages((afterId, pageSize) => {
			pageRequests.push({ afterId, pageSize });
			const startIndex = afterId ? schedules.findIndex((schedule) => schedule.id === afterId) + 1 : 0;
			return Promise.resolve({ data: schedules.slice(startIndex, startIndex + pageSize), error: null });
		});

		expect(result).toHaveLength(1_205);
		expect(result[0].id).toBe('0001');
		expect(result.at(-1)?.id).toBe('1205');
		expect(pageRequests).toEqual([
			{ afterId: null, pageSize: 500 },
			{ afterId: '0500', pageSize: 500 },
			{ afterId: '1000', pageSize: 500 }
		]);
		expect(Math.max(...pageRequests.map((request) => request.pageSize))).toBeLessThanOrEqual(1_000);
	});

	it('rejects a page that cannot advance its cursor', async () => {
		await expect(fetchAllPages(() => Promise.resolve({ data: [{ id: 'same' }, { id: 'same' }], error: null }), 2))
			.rejects.toThrow('Page cursor did not advance');
	});
});
