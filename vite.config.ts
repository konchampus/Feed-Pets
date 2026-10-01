import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	base: process.env.BASE_PATH ?? '/',
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.ts']
	}
});
