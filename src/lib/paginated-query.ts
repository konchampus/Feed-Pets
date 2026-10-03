const defaultPageSize = 500;

export async function fetchAllPages<T>(
	loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
	pageSize = defaultPageSize
) {
	if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Page size must be a positive integer');

	const rows: T[] = [];
	for (let from = 0; ; from += pageSize) {
		const result = await loadPage(from, from + pageSize - 1);
		if (result.error || !result.data) throw result.error ?? new Error('Page returned no data');
		rows.push(...result.data);
		if (result.data.length < pageSize) return rows;
	}
}
