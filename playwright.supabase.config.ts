import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	testMatch: ['supabase-outbox.spec.ts', 'realtime.spec.ts', 'family-export.spec.ts', 'auth-account-switch.spec.ts'],
	fullyParallel: false,
	reporter: process.env.CI ? 'github' : 'list',
	use: { baseURL: 'http://127.0.0.1:4174', ...devices['Desktop Chrome'] },
	webServer: {
		command: 'npm run dev -- --host 127.0.0.1 --port 4174',
		url: 'http://127.0.0.1:4174',
		reuseExistingServer: false,
		env: {
			PUBLIC_SUPABASE_URL: 'https://outbox-test.supabase.co',
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-key',
			PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
			PUBLIC_VAPID_KEY: ''
		}
	}
});
