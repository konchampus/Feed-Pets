import { describe, expect, it, vi } from 'vitest';
import { checkLoginRateLimit } from '../../supabase/functions/_shared/login-rate-limit';

describe('login rate limit order', () => {
	it('does not touch a username bucket after the IP limit is exceeded', async () => {
		const consumeLoginAttempt = vi.fn(async (attemptHash: string) => ({
			data: attemptHash !== 'ip-bucket',
			error: null
		}));

		const result = await checkLoginRateLimit('ip-bucket', 'username-bucket', consumeLoginAttempt);

		expect(result).toBe('limited');
		expect(consumeLoginAttempt).toHaveBeenCalledTimes(1);
		expect(consumeLoginAttempt).toHaveBeenCalledWith('ip-bucket', 50);
	});

	it('checks the username bucket after the IP bucket is allowed', async () => {
		const consumeLoginAttempt = vi.fn(async () => ({ data: true, error: null }));

		const result = await checkLoginRateLimit('ip-bucket', 'username-bucket', consumeLoginAttempt);

		expect(result).toBe('allowed');
		expect(consumeLoginAttempt.mock.calls).toEqual([
			['ip-bucket', 50],
			['username-bucket', 10]
		]);
	});

	it('uses the shared IP bucket when the client IP is unavailable', async () => {
		const consumeLoginAttempt = vi.fn(async (attemptHash: string) => ({
			data: attemptHash !== 'empty-ip-bucket',
			error: null
		}));

		const result = await checkLoginRateLimit('empty-ip-bucket', 'username-bucket', consumeLoginAttempt);

		expect(result).toBe('limited');
		expect(consumeLoginAttempt).toHaveBeenCalledTimes(1);
		expect(consumeLoginAttempt).toHaveBeenCalledWith('empty-ip-bucket', 50);
	});
});
