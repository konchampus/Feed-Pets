import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from './paginated-query';

describe('fetchAllPages', () => {
	it('loads every cursor page, including a full final page', async () => {
		const rows = Array.from({ length: 5 }, (_, index) => ({ id: `id-${index + 1}` }));
		const loadPage = vi.fn(async (afterId: string | null, pageSize: number) => {
			const firstIndex = afterId ? rows.findIndex((row) => row.id === afterId) + 1 : 0;
			return { data: rows.slice(firstIndex, firstIndex + pageSize), error: null };
		});

		await expect(fetchAllPages(loadPage, 2)).resolves.toEqual(rows);
		expect(loadPage).toHaveBeenCalledTimes(3);
		expect(loadPage).toHaveBeenNthCalledWith(1, null, 2);
		expect(loadPage).toHaveBeenNthCalledWith(2, 'id-2', 2);
		expect(loadPage).toHaveBeenNthCalledWith(3, 'id-4', 2);
	});

	it('fails instead of returning a partial export when a page fails', async () => {
		const loadPage = vi.fn()
			.mockResolvedValueOnce({ data: [{ id: 'id-1' }, { id: 'id-2' }], error: null })
			.mockResolvedValueOnce({ data: null, error: new Error('Page failed') });

		await expect(fetchAllPages(loadPage, 2)).rejects.toThrow('Page failed');
	});

	it('stops if the cursor cannot move forward', async () => {
		const loadPage = vi.fn(async () => ({ data: [{ id: 'same-id' }, { id: 'same-id' }], error: null }));

		await expect(fetchAllPages(loadPage, 2)).rejects.toThrow('cursor did not advance');
	});

	it('rejects an invalid page size', async () => {
		await expect(fetchAllPages(async () => ({ data: [], error: null }), 0)).rejects.toThrow('positive integer');
	});
});
