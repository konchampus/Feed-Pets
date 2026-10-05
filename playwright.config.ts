import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	testIgnore: ['supabase-outbox.spec.ts', 'realtime.spec.ts', 'family-export.spec.ts'],
	fullyParallel: true,
	reporter: process.env.CI ? 'github' : 'list',
	use: { baseURL: 'http://127.0.0.1:4173', ...devices['Desktop Chrome'] },
	webServer: {
		command: 'npm run dev -- --host 127.0.0.1 --port 4173',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: !process.env.CI,
		env: {
			PUBLIC_SUPABASE_URL: '',
			PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-key',
			PUBLIC_SUPABASE_ANON_KEY: '',
			PUBLIC_VAPID_KEY: ''
		}
	}
});
