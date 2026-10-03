import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
	PUBLIC_SUPABASE_ANON_KEY,
	PUBLIC_SUPABASE_PUBLISHABLE_KEY,
	PUBLIC_SUPABASE_URL
} from '$env/static/public';
import { createApiKeyFetch } from '../../supabase/functions/_shared/default-api-key';

let client: SupabaseClient | null = null;
const publishableKey = PUBLIC_SUPABASE_PUBLISHABLE_KEY || PUBLIC_SUPABASE_ANON_KEY;

export function supabaseClient() {
	if (!PUBLIC_SUPABASE_URL || !publishableKey) return null;
	client ??= createClient(PUBLIC_SUPABASE_URL, publishableKey, {
		global: { fetch: createApiKeyFetch(publishableKey) },
		auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
	});
	return client;
}
