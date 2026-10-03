export function getDefaultApiKey(keysJson: string | null | undefined, legacyKey: string | null | undefined): string {
	if (keysJson) {
		try {
			const keys: unknown = JSON.parse(keysJson);
			if (typeof keys === 'object' && keys !== null && !Array.isArray(keys)) {
				const defaultKey = (keys as Record<string, unknown>).default;
				if (typeof defaultKey === 'string' && defaultKey) return defaultKey;
			}
		} catch {
			// Older projects may only provide the legacy key.
		}
	}
	return legacyKey ?? '';
}

export function createApiKeyFetch(apiKey: string, baseFetch: typeof fetch = fetch): typeof fetch {
	if (!apiKey.startsWith('sb_publishable_') && !apiKey.startsWith('sb_secret_')) return baseFetch;

	return async (input, init) => {
		const headers = new Headers(input instanceof Request ? input.headers : undefined);
		new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
		if (headers.get('Authorization') === `Bearer ${apiKey}`) headers.delete('Authorization');
		return baseFetch(input, { ...init, headers });
	};
}
