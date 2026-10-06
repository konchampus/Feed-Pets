import { expect, test } from '@playwright/test';

const memberId = '123e4567-e89b-12d3-a456-426614174020';
const ownerId = '123e4567-e89b-12d3-a456-426614174021';
const familyId = '123e4567-e89b-12d3-a456-426614174022';
const petId = '123e4567-e89b-12d3-a456-426614174024';
const memberEventId = '123e4567-e89b-12d3-a456-426614174026';
const ownerEventId = '123e4567-e89b-12d3-a456-426614174027';
const scheduleId = '123e4567-e89b-12d3-a456-426614174028';

const memberUser = {
	id: memberId,
	aud: 'authenticated',
	role: 'authenticated',
	email: 'member@example.test',
	app_metadata: { provider: 'email', providers: ['email'] },
	user_metadata: { display_name: 'Лена' },
	created_at: '2026-10-06T00:00:00.000Z',
	updated_at: '2026-10-06T00:00:00.000Z'
};

const familyPets = [
	{ id: petId, family_id: familyId, name: 'Рада', breed: 'Метис', birthday: null, photo_url: null, allergies: '', health_notes: '' }
];

const familyEvents = [
	{
		id: memberEventId, family_id: familyId, pet_id: petId, kind: 'meal', occurred_at: '2026-10-06T08:00:00.000Z',
		author_id: memberId, actor_name: 'Лена', amount: 80, unit: 'г', label: null, note: 'Моя запись'
	},
	{
		id: ownerEventId, family_id: familyId, pet_id: petId, kind: 'walk', occurred_at: '2026-10-06T09:00:00.000Z',
		author_id: ownerId, actor_name: 'Владелец', amount: 30, unit: 'мин', label: null, note: 'Запись владельца'
	}
];

const familySchedules = [
	{
		id: scheduleId, family_id: familyId, pet_id: petId, kind: 'meal', title: 'Утреннее кормление',
		local_time: '08:00:00', timezone: 'Europe/Moscow', weekdays: [0, 1, 2, 3, 4, 5, 6], is_active: true
	}
];

test('limits a family member to their family and own event edits', async ({ page, baseURL }) => {
	const scopedReads: string[] = [];
	const unexpectedRequests: string[] = [];
	const writes: Array<{ table: string; method: string; id: string | null; body: unknown }> = [];
	const pageErrors: string[] = [];
	const joinedTopics: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.route('https://outbox-test.supabase.co/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const headers = {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
			'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
			'access-control-expose-headers': 'content-range, x-supabase-api-version'
		};
		const respond = (status: number, body: unknown) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
		const hasMemberToken = request.headers().authorization === 'Bearer member-access-token';
		if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }

		if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
			await respond(hasMemberToken ? 200 : 401, hasMemberToken ? memberUser : { message: 'Invalid token' });
			return;
		}
		if (url.pathname === '/rest/v1/family_members' && request.method() === 'GET') {
			if (!hasMemberToken) { unexpectedRequests.push('family_members without member bearer'); await respond(401, []); return; }
			await respond(200, [{ family_id: familyId, role: 'member', families: { name: 'Семья Лены' } }]);
			return;
		}
		if (url.pathname === '/rest/v1/push_subscriptions' && request.method() === 'GET') {
			if (!hasMemberToken) unexpectedRequests.push('push_subscriptions without member bearer');
			await respond(hasMemberToken ? 200 : 401, []);
			return;
		}

		const table = url.pathname.split('/').at(-1) ?? '';
		if (['pets', 'care_events', 'care_schedules'].includes(table) && request.method() === 'GET') {
			const requestedFamily = url.searchParams.get('family_id');
			scopedReads.push(`${table}:${request.headers().authorization}:${requestedFamily}`);
			if (!hasMemberToken || requestedFamily !== `eq.${familyId}`) {
				unexpectedRequests.push(`unscoped family read: ${table} ${request.headers().authorization} ${requestedFamily}`);
				await respond(200, []);
				return;
			}
			const rows = table === 'pets' ? familyPets : table === 'care_events' ? familyEvents : familySchedules;
			await respond(200, rows);
			return;
		}
		if (['pets', 'care_events', 'care_schedules'].includes(table) && ['POST', 'PATCH', 'DELETE'].includes(request.method())) {
			const postData = request.postData();
			writes.push({ table, method: request.method(), id: url.searchParams.get('id')?.replace(/^eq\./, '') ?? null, body: postData ? JSON.parse(postData) : null });
			if (!hasMemberToken) { await respond(401, []); return; }
			if (table === 'care_events' && request.method() === 'PATCH' && url.searchParams.get('id') === `eq.${memberEventId}`) {
				const updates = request.postDataJSON() as Record<string, unknown>;
				Object.assign(familyEvents[0], updates);
				await respond(200, [{ id: memberEventId }]);
				return;
			}
			unexpectedRequests.push(`forbidden role write reached REST mock: ${table} ${request.method()}`);
			await respond(403, { message: 'Member role cannot perform this write' });
			return;
		}

		unexpectedRequests.push(`unexpected request: ${request.method()} ${url.pathname}`);
		await respond(404, { message: 'Unexpected request' });
	});

	await page.routeWebSocket((url) => url.hostname === 'outbox-test.supabase.co' && url.pathname === '/realtime/v1/websocket', (socket) => {
		socket.onMessage((message) => {
			if (typeof message !== 'string') return;
			const [joinRef, ref, topic, event] = JSON.parse(message) as [string | null, string, string, string];
			if (event !== 'phx_join') return;
			joinedTopics.push(topic);
			socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
		});
	});

	await page.addInitScript((user) => {
		localStorage.setItem('sb-outbox-test-auth-token', JSON.stringify({
			access_token: 'member-access-token', refresh_token: 'member-refresh-token', token_type: 'bearer', expires_in: 3600,
			expires_at: Math.floor(Date.now() / 1000) + 3600, user
		}));
	}, memberUser);

	await page.goto(baseURL ?? 'http://127.0.0.1:4174/');
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
	await expect.poll(() => joinedTopics).toContain(`realtime:family:${familyId}`);
	await expect(page.getByText('Общий профиль · Семья Лены', { exact: true })).toBeVisible();
	await expect.poll(() => scopedReads.length).toBeGreaterThanOrEqual(3);
	expect(scopedReads.every((read) => read.includes('Bearer member-access-token') && read.endsWith(`eq.${familyId}`))).toBe(true);
	expect(unexpectedRequests).toEqual([]);
	expect(JSON.parse(await page.evaluate((id) => localStorage.getItem(`lapki:family:${id}:pets`), familyId) ?? '[]').map((pet: { id: string }) => pet.id)).toEqual([petId]);
	expect(JSON.parse(await page.evaluate((id) => localStorage.getItem(`lapki:family:${id}:events`), familyId) ?? '[]').map((event: { id: string }) => event.id).sort()).toEqual([memberEventId, ownerEventId].sort());
	expect(JSON.parse(await page.evaluate((id) => localStorage.getItem(`lapki:family:${id}:schedules`), familyId) ?? '[]').map((schedule: { id: string }) => schedule.id)).toEqual([scheduleId]);

	await page.getByRole('button', { name: 'История', exact: true }).click();
	const ownEventRow = page.locator('.history-row').filter({ hasText: 'Моя запись' });
	const ownerEventRow = page.locator('.history-row').filter({ hasText: 'Запись владельца' });
	await expect(ownEventRow).toBeVisible();
	await expect(ownerEventRow).toBeVisible();
	await expect(ownEventRow.getByRole('button', { name: 'Исправить запись' })).toBeVisible();
	await expect(ownerEventRow.getByRole('button', { name: 'Исправить запись' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Удалить запись' })).toHaveCount(0);
	await ownEventRow.getByRole('button', { name: 'Исправить запись' }).click();
	await page.locator('#care-note').fill('Моя обновлённая запись');
	await page.getByRole('button', { name: 'Сохранить изменения' }).click();
	await expect(page.getByText('Моя обновлённая запись', { exact: true })).toBeVisible();
	await expect.poll(() => writes.length).toBe(1);
	expect(writes).toEqual([{ table: 'care_events', method: 'PATCH', id: memberEventId, body: expect.objectContaining({ note: 'Моя обновлённая запись' }) }]);

	await page.getByRole('button', { name: 'Расписание', exact: true }).click();
	const scheduleRow = page.locator('.schedule-row').filter({ hasText: 'Утреннее кормление' });
	await expect(scheduleRow).toBeVisible();
	await expect(page.locator('#schedule-title')).toBeDisabled();
	await expect(page.locator('#schedule-kind')).toBeDisabled();
	await expect(page.locator('#schedule-time')).toBeDisabled();
	await expect(scheduleRow.getByRole('switch')).toBeDisabled();
	await expect(scheduleRow.getByRole('button', { name: 'Удалить напоминание: Утреннее кормление' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	const petRow = page.locator('.pet-settings-row').filter({ hasText: 'Рада' });
	await expect(petRow).toBeVisible();
	await expect(petRow.getByRole('button', { name: 'Изменить профиль Рада' })).toHaveCount(0);
	await expect(petRow.getByRole('button', { name: 'Удалить профиль Рада' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Добавить собаку', exact: true })).toHaveCount(0);
	await expect.poll(() => writes.length).toBe(1);
	expect(unexpectedRequests).toEqual([]);
	expect(pageErrors).toEqual([]);
});
