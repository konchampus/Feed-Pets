import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from './paginated-query';

describe('fetchAllPages', () => {
	it('loads every page, including a full final page', async () => {
		const rows = Array.from({ length: 5 }, (_, index) => index);
		const loadPage = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }));

		await expect(fetchAllPages(loadPage, 2)).resolves.toEqual(rows);
		expect(loadPage).toHaveBeenCalledTimes(3);
		expect(loadPage).toHaveBeenNthCalledWith(3, 4, 5);
	});

	it('fails instead of returning a partial export when a page fails', async () => {
		const loadPage = vi.fn()
			.mockResolvedValueOnce({ data: [1, 2], error: null })
			.mockResolvedValueOnce({ data: null, error: new Error('Page failed') });

		await expect(fetchAllPages(loadPage, 2)).rejects.toThrow('Page failed');
	});

	it('rejects an invalid page size', async () => {
		await expect(fetchAllPages(async () => ({ data: [], error: null }), 0)).rejects.toThrow('positive integer');
	});
});
