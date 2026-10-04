import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import {
	PUBLIC_SUPABASE_ANON_KEY,
	PUBLIC_SUPABASE_PUBLISHABLE_KEY,
	PUBLIC_SUPABASE_URL
} from '$env/static/public';
import { createApiKeyFetch } from '../../supabase/functions/_shared/default-api-key';

let client: SupabaseClient<Database> | null = null;
const publishableKey = PUBLIC_SUPABASE_PUBLISHABLE_KEY || PUBLIC_SUPABASE_ANON_KEY;

export function supabaseClient() {
	if (!PUBLIC_SUPABASE_URL || !publishableKey) return null;
	client ??= createClient<Database>(PUBLIC_SUPABASE_URL, publishableKey, {
		global: { fetch: createApiKeyFetch(publishableKey) },
		auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
	});
	return client;
}

export function getStoredAuthUserId() {
	if (typeof localStorage === 'undefined' || !PUBLIC_SUPABASE_URL) return '';
	try {
		const projectRef = new URL(PUBLIC_SUPABASE_URL).hostname.split('.')[0];
		const storedSession = JSON.parse(localStorage.getItem(`sb-${projectRef}-auth-token`) ?? 'null') as {
			user?: { id?: unknown };
		} | null;
		const userId = storedSession?.user?.id;
		return typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
			? userId
			: '';
	} catch {
		return '';
	}
}

export async function refreshStoredAuthSession(client: SupabaseClient<Database>) {
	if (typeof localStorage === 'undefined' || !PUBLIC_SUPABASE_URL) return false;
	try {
		const projectRef = new URL(PUBLIC_SUPABASE_URL).hostname.split('.')[0];
		const storedSession = JSON.parse(localStorage.getItem(`sb-${projectRef}-auth-token`) ?? 'null') as {
			refresh_token?: unknown;
		} | null;
		if (typeof storedSession?.refresh_token !== 'string' || !storedSession.refresh_token) return false;
		const { data, error } = await client.auth.refreshSession({ refresh_token: storedSession.refresh_token });
		return !error && Boolean(data.user);
	} catch {
		return false;
	}
}
