type ConsumeLoginAttempt = (
	attemptHash: string,
	maxAttempts: number
) => Promise<{ data: boolean | null; error: unknown | null }>;

export async function checkLoginRateLimit(
	ipBucket: string,
	usernameBucket: string,
	consumeLoginAttempt: ConsumeLoginAttempt
): Promise<'allowed' | 'limited' | 'error'> {
	const ipResult = await consumeLoginAttempt(ipBucket, 50);
	if (ipResult.error) return 'error';
	if (!ipResult.data) return 'limited';

	const usernameResult = await consumeLoginAttempt(usernameBucket, 10);
	if (usernameResult.error) return 'error';
	if (!usernameResult.data) return 'limited';
	return 'allowed';
}
