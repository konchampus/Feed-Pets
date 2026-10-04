const defaultPageSize = 500;

export async function fetchAllPages<T extends { id: string }>(
	loadPage: (afterId: string | null, pageSize: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
	pageSize = defaultPageSize
) {
	if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Page size must be a positive integer');

	const rows: T[] = [];
	let afterId: string | null = null;
	for (;;) {
		const result = await loadPage(afterId, pageSize);
		if (result.error || !result.data) throw result.error ?? new Error('Page returned no data');
		rows.push(...result.data);
		if (result.data.length < pageSize) return rows;

		const nextId = result.data[result.data.length - 1]?.id;
		if (!nextId || nextId <= (afterId ?? '')) throw new Error('Page cursor did not advance');
		afterId = nextId;
	}
}
