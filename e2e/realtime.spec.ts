import { expect, test } from '@playwright/test';

const userId = '123e4567-e89b-12d3-a456-426614174000';
const familyId = '123e4567-e89b-12d3-a456-426614174001';
const petId = '123e4567-e89b-12d3-a456-426614174002';

test('loads family changes missed before the initial Realtime subscription', async ({ page, baseURL }) => {
	let membershipReads = 0;
	let petReads = 0;
	let eventReads = 0;
	let scheduleReads = 0;
	let serverEvents: Record<string, unknown>[] = [];
	let resolveJoin!: (join: { send: (message: string) => void; joinRef: string | null; ref: string; topic: string }) => void;
	const joinReceived = new Promise<{ send: (message: string) => void; joinRef: string | null; ref: string; topic: string }>((resolve) => {
		resolveJoin = resolve;
	});

	await page.route('https://outbox-test.supabase.co/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const corsHeaders = {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
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
		if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
			await respond(200, {
				id: userId,
				aud: 'authenticated',
				role: 'authenticated',
				email: 'family@example.test',
				app_metadata: { provider: 'email', providers: ['email'] },
				user_metadata: { display_name: 'Аня' },
				created_at: '2026-10-02T00:00:00.000Z',
				updated_at: '2026-10-02T00:00:00.000Z'
			});
			return;
		}
		if (url.pathname === '/rest/v1/family_members' && request.method() === 'GET') {
			membershipReads++;
			await respond(200, [{ family_id: familyId, role: 'owner', families: { name: 'Семья' } }]);
			return;
		}
		if (url.pathname === '/rest/v1/pets' && request.method() === 'GET') {
			petReads++;
			await respond(200, [{ id: petId, name: 'Рада', breed: 'Метис', birthday: null, photo_url: null, allergies: '', health_notes: '' }]);
			return;
		}
		if (url.pathname === '/rest/v1/care_events' && request.method() === 'GET') {
			eventReads++;
			await respond(200, serverEvents);
			return;
		}
		if (url.pathname === '/rest/v1/care_schedules' && request.method() === 'GET') {
			scheduleReads++;
			await respond(200, []);
			return;
		}
		if (url.pathname === '/rest/v1/push_subscriptions' && request.method() === 'GET') {
			await respond(200, []);
			return;
		}
		await respond(404, { message: `Unexpected Supabase request: ${request.method()} ${url.pathname}` });
	});

	await page.routeWebSocket((url) => url.hostname === 'outbox-test.supabase.co' && url.pathname === '/realtime/v1/websocket', (socket) => {
		socket.onMessage((message) => {
			if (typeof message !== 'string') return;
			const [joinRef, ref, topic, event] = JSON.parse(message) as [string | null, string, string, string];
			if (event === 'phx_join') resolveJoin({ send: (reply) => socket.send(reply), joinRef, ref, topic });
		});
	});

	await page.addInitScript(({ seededUserId }) => {
		localStorage.setItem('sb-outbox-test-auth-token', JSON.stringify({
			access_token: 'test-access-token',
			refresh_token: 'test-refresh-token',
			token_type: 'bearer',
			expires_in: 3600,
			expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: {
				id: seededUserId,
				aud: 'authenticated',
				role: 'authenticated',
				email: 'family@example.test',
				app_metadata: { provider: 'email', providers: ['email'] },
				user_metadata: { display_name: 'Аня' },
				created_at: '2026-10-02T00:00:00.000Z',
				updated_at: '2026-10-02T00:00:00.000Z'
			}
		}));
	}, { seededUserId: userId });

	await page.goto(baseURL ?? 'http://127.0.0.1:4174/');
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
	const join = await joinReceived;
	expect(join.topic).toBe(`realtime:family:${familyId}`);
	await expect.poll(() => [membershipReads, petReads, eventReads, scheduleReads]).toEqual([1, 1, 1, 1]);
	await expect(page.locator('.cloud-error')).toHaveCount(0);

	serverEvents = [{
		id: '123e4567-e89b-12d3-a456-426614174005',
		pet_id: petId,
		kind: 'water',
		occurred_at: new Date().toISOString(),
		author_id: userId,
		actor_name: 'Аня',
		amount: null,
		unit: null,
		label: 'Событие во время подключения',
		note: null
	}];
	join.send(JSON.stringify([join.joinRef, join.ref, join.topic, 'phx_reply', { status: 'ok', response: {} }]));

	await expect.poll(() => [membershipReads, petReads, eventReads, scheduleReads]).toEqual([2, 2, 2, 2]);
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByText('Вода', { exact: true })).toBeVisible();
	await expect(page.getByText('Событие во время подключения', { exact: true })).toBeVisible();
	expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lapki:family:123e4567-e89b-12d3-a456-426614174001:events') ?? '[]'))).toContainEqual(expect.objectContaining({ id: '123e4567-e89b-12d3-a456-426614174005' }));
	await expect(page.locator('.cloud-error')).toHaveCount(0);
});
