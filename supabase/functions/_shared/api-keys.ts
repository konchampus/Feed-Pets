import { createApiKeyFetch, getDefaultApiKey } from './default-api-key.ts';

export { createApiKeyFetch };

export function getPublishableKey(): string {
	return getDefaultApiKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'), Deno.env.get('SUPABASE_ANON_KEY'));
}

export function getSecretKey(): string {
	return getDefaultApiKey(Deno.env.get('SUPABASE_SECRET_KEYS'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
}
