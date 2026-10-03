import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createApiKeyFetch, getDefaultApiKey } from '../../supabase/functions/_shared/default-api-key';

describe('getDefaultApiKey', () => {
	it('uses the default key from the current Supabase key map', () => {
		expect(getDefaultApiKey('{"default":"sb_publishable_test"}', 'legacy-key')).toBe('sb_publishable_test');
	});

	it('falls back to the legacy key when the current map is unavailable', () => {
		expect(getDefaultApiKey(null, 'legacy-key')).toBe('legacy-key');
		expect(getDefaultApiKey('{invalid', 'legacy-key')).toBe('legacy-key');
	});

	it('returns an empty value when neither key is configured', () => {
		expect(getDefaultApiKey(null, null)).toBe('');
	});
});

describe('createApiKeyFetch', () => {
	it('strips SDK fallback Bearer keys from anonymous Auth and REST requests', async () => {
		const apiKey = 'sb_publishable_test';
		const requestHeaders = new Map<string, Headers>();
		const mockFetch: typeof fetch = async (input, init) => {
			const url = new URL(input instanceof Request ? input.url : input.toString());
			requestHeaders.set(url.pathname, new Headers(init?.headers));
			if (url.pathname === '/auth/v1/token') {
				return Response.json({
					access_token: 'user-session-token',
					refresh_token: 'refresh-token',
					token_type: 'bearer',
					expires_in: 3600,
					user: { id: '123e4567-e89b-12d3-a456-426614174000', aud: 'authenticated', role: 'authenticated', email: 'family@example.test' }
				});
			}
			return Response.json([]);
		};
		const client = createClient('https://project.supabase.co', apiKey, {
			global: { fetch: createApiKeyFetch(apiKey, mockFetch) },
			auth: { persistSession: false, autoRefreshToken: false }
		});

		await client.from('pets').select();
		await client.auth.signInWithPassword({ email: 'family@example.test', password: 'test-password' });

		for (const path of ['/rest/v1/pets', '/auth/v1/token']) {
			expect(requestHeaders.get(path)?.get('apikey')).toBe(apiKey);
			expect(requestHeaders.get(path)?.has('Authorization')).toBe(false);
		}
	});

	it('sends new API keys only in apikey while preserving user tokens', async () => {
		const apiKey = 'sb_publishable_test';
		let capturedHeaders = new Headers();
		const apiFetch = createApiKeyFetch(apiKey, async (_input, init) => {
			capturedHeaders = new Headers(init?.headers);
			return new Response(null, { status: 200 });
		});

		await apiFetch('https://project.supabase.co/rest/v1/pets', {
			headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
		});
		expect(capturedHeaders.get('apikey')).toBe(apiKey);
		expect(capturedHeaders.has('Authorization')).toBe(false);

		await apiFetch('https://project.supabase.co/rest/v1/pets', {
			headers: { apikey: apiKey, Authorization: 'Bearer user-session-token' }
		});
		expect(capturedHeaders.get('Authorization')).toBe('Bearer user-session-token');
	});

	it('keeps legacy-key behavior unchanged', async () => {
		const apiKey = 'legacy-anon-key';
		let capturedHeaders = new Headers();
		const apiFetch = createApiKeyFetch(apiKey, async (_input, init) => {
			capturedHeaders = new Headers(init?.headers);
			return new Response(null, { status: 200 });
		});

		await apiFetch('https://project.supabase.co/rest/v1/pets', {
			headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
		});
		expect(capturedHeaders.get('Authorization')).toBe(`Bearer ${apiKey}`);
	});
});
