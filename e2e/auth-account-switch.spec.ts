import { expect, test } from '@playwright/test';

const userA = {
	id: '123e4567-e89b-12d3-a456-426614174000',
	aud: 'authenticated',
	role: 'authenticated',
	email: 'anya@example.test',
	app_metadata: { provider: 'email', providers: ['email'] },
	user_metadata: { display_name: 'Аня' },
	created_at: '2026-10-02T00:00:00.000Z',
	updated_at: '2026-10-02T00:00:00.000Z'
};

const userB = {
	...userA,
	id: '123e4567-e89b-12d3-a456-426614174010',
	email: 'boris@example.test',
	user_metadata: { display_name: 'Борис' }
};

const familyA = '123e4567-e89b-12d3-a456-426614174001';
const familyB = '123e4567-e89b-12d3-a456-426614174011';

test('signs out of family A, signs in to family B, and ignores a late response from A', async ({ page, baseURL }) => {
	let userACareReads = 0;
	let heldOldCareResponse = false;
	let releaseOldCareResponse: (() => void) | undefined;
	let logoutRequests = 0;
	let resolveOldCareRequest!: () => void;
	const oldCareRequest = new Promise<void>((resolve) => { resolveOldCareRequest = resolve; });
	const joinedTopics: string[] = [];
	const leftTopics: string[] = [];
	const requestErrors: string[] = [];
	page.on('pageerror', (error) => requestErrors.push(error.message));

	await page.route('https://outbox-test.supabase.co/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const headers = {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
			'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
			'access-control-expose-headers': 'content-range, x-supabase-api-version'
		};
		const respond = (status: number, body: unknown) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
		if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }

		if (url.pathname === '/auth/v1/logout' && request.method() === 'POST') {
			logoutRequests++;
			expect(request.headers().authorization).toBe('Bearer access-token-a');
			await route.fulfill({ status: 204, headers });
			return;
		}
		if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
			expect(request.postDataJSON()).toMatchObject({ email: userB.email, password: 'test-password' });
			await respond(200, {
				access_token: 'access-token-b', refresh_token: 'refresh-token-b', token_type: 'bearer', expires_in: 3600,
				expires_at: Math.floor(Date.now() / 1000) + 3600, user: userB
			});
			return;
		}
		if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
			const token = request.headers().authorization;
			await respond(200, token === 'Bearer access-token-a' ? userA : userB);
			return;
		}
		if (url.pathname === '/rest/v1/family_members' && request.method() === 'GET') {
			const isUserA = request.headers().authorization === 'Bearer access-token-a';
			const familyId = isUserA ? familyA : familyB;
			await respond(200, [{ family_id: familyId, role: 'owner', families: { name: isUserA ? 'Семья Ани' : 'Семья Бориса' } }]);
			return;
		}
		if (url.pathname === '/rest/v1/pets' && request.method() === 'GET') {
			const isUserA = request.headers().authorization === 'Bearer access-token-a';
			const familyId = isUserA ? familyA : familyB;
			await respond(200, [{
				id: isUserA ? '123e4567-e89b-12d3-a456-426614174002' : '123e4567-e89b-12d3-a456-426614174012',
				name: isUserA ? 'Рада' : 'Бим', breed: 'Метис', birthday: null, photo_url: null, allergies: '', health_notes: '', family_id: familyId
			}]);
			return;
		}
		if (url.pathname === '/rest/v1/care_events' && request.method() === 'GET') {
			const isUserA = request.headers().authorization === 'Bearer access-token-a';
			if (isUserA) userACareReads++;
			if (isUserA && userACareReads > 1 && !heldOldCareResponse) {
				heldOldCareResponse = true;
				resolveOldCareRequest();
				await new Promise<void>((resolve) => { releaseOldCareResponse = resolve; });
				await respond(200, [{
					id: '123e4567-e89b-12d3-a456-426614174003', pet_id: '123e4567-e89b-12d3-a456-426614174002',
					kind: 'meal', occurred_at: '2026-10-06T08:00:00.000Z', author_id: userA.id, actor_name: 'Аня', amount: 80, unit: 'г', label: null, note: 'Ответ старой семьи'
				}]);
				return;
			}
			const isUserB = request.headers().authorization === 'Bearer access-token-b';
			await respond(200, isUserB ? [{
				id: '123e4567-e89b-12d3-a456-426614174013', pet_id: '123e4567-e89b-12d3-a456-426614174012',
				kind: 'meal', occurred_at: '2026-10-06T09:00:00.000Z', author_id: userB.id, actor_name: 'Борис', amount: 120, unit: 'г', label: null, note: 'Запись семьи Бориса'
			}] : []);
			return;
		}
		if (url.pathname === '/rest/v1/care_schedules' && request.method() === 'GET') { await respond(200, []); return; }
		if (url.pathname === '/rest/v1/push_subscriptions' && request.method() === 'GET') { await respond(200, []); return; }
		requestErrors.push(`Unexpected Supabase request: ${request.method()} ${url.pathname}`);
		await respond(404, { message: `Unexpected Supabase request: ${request.method()} ${url.pathname}` });
	});

	await page.routeWebSocket((url) => url.hostname === 'outbox-test.supabase.co' && url.pathname === '/realtime/v1/websocket', (socket) => {
		socket.onMessage((message) => {
			if (typeof message !== 'string') return;
			const [joinRef, ref, topic, event] = JSON.parse(message) as [string | null, string, string, string];
			if (event === 'phx_join') {
				joinedTopics.push(topic);
				socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
			} else if (event === 'phx_leave') leftTopics.push(topic);
		});
	});

	await page.addInitScript((seedUser) => {
		localStorage.setItem('sb-outbox-test-auth-token', JSON.stringify({
			access_token: 'access-token-a', refresh_token: 'refresh-token-a', token_type: 'bearer', expires_in: 3600,
			expires_at: Math.floor(Date.now() / 1000) + 3600, user: seedUser
		}));
	}, userA);

	try {
	await page.goto(baseURL ?? 'http://127.0.0.1:4174/');
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
	await expect.poll(() => joinedTopics).toContain(`realtime:family:${familyA}`);
	await oldCareRequest;

	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await page.getByRole('button', { name: 'Выйти из аккаунта' }).click();
	await expect(page.getByRole('button', { name: 'Войти или создать семью' })).toBeVisible();
	expect(logoutRequests).toBe(1);
	await expect.poll(() => leftTopics).toContain(`realtime:family:${familyA}`);
	await page.getByRole('button', { name: 'Войти или создать семью' }).click();
	await page.locator('#auth-email').fill(userB.email);
	await page.locator('#auth-password').fill('test-password');
	await page.getByRole('button', { name: 'Войти', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Семья Бориса' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Изменить профиль Бим' })).toBeVisible();
	await expect.poll(() => joinedTopics).toContain(`realtime:family:${familyB}`);
	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'День Бим' })).toBeVisible();
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByText('Запись семьи Бориса', { exact: true })).toBeVisible();
	await expect(page.getByText('Ответ старой семьи', { exact: true })).toHaveCount(0);
	await expect.poll(() => page.evaluate(() => localStorage.getItem('lapki:family:123e4567-e89b-12d3-a456-426614174011:events'))).toContain('Запись семьи Бориса');

	releaseOldCareResponse?.();
	await expect(page.getByText('Запись семьи Бориса', { exact: true })).toBeVisible();
	await expect(page.getByText('Ответ старой семьи', { exact: true })).toHaveCount(0);
	await expect.poll(() => page.evaluate(() => localStorage.getItem('lapki:family:123e4567-e89b-12d3-a456-426614174011:events'))).not.toContain('Ответ старой семьи');
	await expect(page.locator('.cloud-error')).toHaveCount(0);
	expect(requestErrors).toEqual([]);
	} finally {
		releaseOldCareResponse?.();
	}
});
