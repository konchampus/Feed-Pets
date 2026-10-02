import { expect, test } from '@playwright/test';

const testUser = {
	id: '123e4567-e89b-12d3-a456-426614174000',
	aud: 'authenticated',
	role: 'authenticated',
	email: 'family@example.test',
	app_metadata: { provider: 'email', providers: ['email'] },
	user_metadata: { display_name: 'Аня' },
	created_at: '2026-10-02T00:00:00.000Z',
	updated_at: '2026-10-02T00:00:00.000Z'
};

test('retries a family event and push after the insert response is lost', async ({ browser, baseURL }) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	let serverEvents: Record<string, unknown>[] = [];
	let insertAttempts = 0;
	let pushAttempts = 0;
	const insertedEventIds: unknown[] = [];
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.route('https://outbox-test.supabase.co/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const corsHeaders = {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
			'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
			'access-control-expose-headers': 'content-range, x-supabase-api-version'
		};
		const respond = (status: number, body: unknown) => route.fulfill({
			status,
			headers: corsHeaders,
			contentType: 'application/json',
			body: JSON.stringify(body)
		});

		if (request.method() === 'OPTIONS') {
			await route.fulfill({ status: 204, headers: corsHeaders });
			return;
		}
		if (url.pathname === '/auth/v1/user') {
			await respond(200, testUser);
			return;
		}
		if (url.pathname === '/rest/v1/family_members') {
			await respond(200, [{ family_id: '123e4567-e89b-12d3-a456-426614174001', role: 'owner', families: { name: 'Семья' } }]);
			return;
		}
		if (url.pathname === '/rest/v1/pets') {
			await respond(200, [{
				id: '123e4567-e89b-12d3-a456-426614174002',
				name: 'Рада',
				breed: 'Метис',
				birthday: null,
				photo_url: null,
				allergies: '',
				health_notes: ''
			}]);
			return;
		}
		if (url.pathname === '/rest/v1/care_events' && request.method() === 'GET') {
			await respond(200, serverEvents);
			return;
		}
		if (url.pathname === '/rest/v1/care_events' && request.method() === 'POST') {
			const body = request.postDataJSON() as Record<string, unknown> | Record<string, unknown>[];
			const newEvents = Array.isArray(body) ? body : [body];
			insertAttempts++;
			insertedEventIds.push(...newEvents.map((event) => event.id));
			if (insertAttempts === 1) {
				serverEvents.push(...newEvents);
				await respond(503, { message: 'The write may have completed before its response was lost.' });
				return;
			}
			if (insertAttempts === 3) {
				await respond(503, { message: 'The service is temporarily unavailable.' });
				return;
			}
			for (const event of newEvents) {
				const savedEvent = serverEvents.find((savedEvent) => savedEvent.id === event.id);
				if (savedEvent) Object.assign(savedEvent, event);
				else serverEvents.push(event);
			}
			await respond(201, []);
			return;
		}
		if (url.pathname === '/rest/v1/care_schedules') {
			await respond(200, []);
			return;
		}
		if (url.pathname === '/functions/v1/push-event' && request.method() === 'POST') {
			pushAttempts++;
			if (pushAttempts === 1) {
				await route.fulfill({
					status: 503,
					headers: { ...corsHeaders, 'Retry-After': '30' },
					contentType: 'application/json',
					body: JSON.stringify({ error: 'Push service is temporarily unavailable.' })
				});
				return;
			}
			await respond(200, { sent: true });
			return;
		}
		await respond(404, { message: 'Unexpected Supabase request: ' + request.method() + ' ' + url.pathname });
	});

	await page.addInitScript(() => {
		localStorage.setItem('sb-outbox-test-auth-token', JSON.stringify({
			access_token: 'test-access-token',
			refresh_token: 'test-refresh-token',
			token_type: 'bearer',
			expires_in: 3600,
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: {
				id: '123e4567-e89b-12d3-a456-426614174000',
				aud: 'authenticated',
				role: 'authenticated',
				email: 'family@example.test',
				app_metadata: { provider: 'email', providers: ['email'] },
				user_metadata: { display_name: 'Аня' },
				created_at: '2026-10-02T00:00:00.000Z',
				updated_at: '2026-10-02T00:00:00.000Z'
			}
		}));
	});

	try {
		await page.goto(baseURL ?? 'http://127.0.0.1:4174/');
		await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
		await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
		await page.getByRole('button', { name: 'Кормление', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await dialog.locator('#care-amount').fill('80');
		await dialog.getByRole('button', { name: 'Сохранить отметку' }).click();
		await expect(page.getByText('Запись сохранена на устройстве, синхронизация не удалась')).toBeVisible();
		expect(insertAttempts).toBe(1);
		await expect(page.getByText('Кормление · 80 г', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'История', exact: true }).click();
		await page.getByRole('button', { name: 'Исправить запись' }).click();
		const editDialog = page.getByRole('dialog');
		await editDialog.locator('#care-amount').fill('95');
		await editDialog.getByRole('button', { name: 'Сохранить изменения' }).click();
		await expect(page.getByText('Кормление · 95 г', { exact: true })).toBeVisible();

		await page.reload();
		await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
		await expect(page.getByText('Кормление · 95 г', { exact: true })).toBeVisible();
		await expect.poll(() => insertAttempts).toBe(2);
		await expect.poll(() => pushAttempts).toBe(1);
		expect(insertedEventIds[1]).toBe(insertedEventIds[0]);
		expect(serverEvents).toHaveLength(1);
		expect(serverEvents[0].amount).toBe(95);
		await expect.poll(() => page.evaluate(() => localStorage.getItem('lapki:family:123e4567-e89b-12d3-a456-426614174001:pendingEvents'))).toBe('[]');
		await expect.poll(() => page.evaluate(() => localStorage.getItem('lapki:family:123e4567-e89b-12d3-a456-426614174001:pendingPushEvents'))).toContain(insertedEventIds[0] as string);

		await page.reload();
		await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
		await expect.poll(() => pushAttempts).toBe(2);
		expect(pageErrors).toEqual([]);

		await page.getByRole('button', { name: 'Прогулка', exact: true }).click();
		const walkDialog = page.getByRole('dialog');
		await walkDialog.locator('#care-amount').fill('30');
		await walkDialog.getByRole('button', { name: 'Сохранить отметку' }).click();
		await expect(page.getByText('Запись сохранена на устройстве, синхронизация не удалась')).toBeVisible();
		expect(insertAttempts).toBe(3);
		await page.evaluate(() => window.dispatchEvent(new Event('online')));
		await expect.poll(() => insertAttempts).toBe(4);
		expect(insertedEventIds[3]).toBe(insertedEventIds[2]);
		await expect(page.getByText('Прогулка · 30 мин', { exact: true })).toBeVisible();
		await expect.poll(() => pushAttempts).toBe(3);
		expect(serverEvents).toHaveLength(2);
		await expect.poll(() => page.evaluate(() => localStorage.getItem('lapki:family:123e4567-e89b-12d3-a456-426614174001:pendingPushEvents'))).toBe('[]');
	} finally {
		await context.close();
	}
});
