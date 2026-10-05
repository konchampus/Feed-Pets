import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const userId = '123e4567-e89b-12d3-a456-426614174000';
const familyId = '123e4567-e89b-12d3-a456-426614174001';
const petCount = 501;
const eventCount = 501;
const scheduleCount = 501;

type TableName = 'pets' | 'care_events' | 'care_schedules';
type ExportPage = { afterId: string | null; limit: number };
type JoinMessage = { topic: string; joinRef: string | null; ref: string; send: (message: string) => void };

function rowId(index: number) {
	return `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

function makeRows() {
	const pets = Array.from({ length: petCount }, (_, index) => ({
		id: rowId(index), name: `Собака ${index + 1}`, breed: 'Метис', birthday: null,
		photo_url: null, allergies: '', health_notes: '', created_at: '2000-01-01T00:00:00.000Z'
	}));
	const events = Array.from({ length: eventCount }, (_, index) => ({
		id: rowId(index), pet_id: pets[0].id,
		kind: index === 0 || index === eventCount - 1 ? 'weight' : 'meal',
		occurred_at: index === 0 ? '2026-01-01T08:00:00.000Z' : index === eventCount - 1 ? '2026-09-01T08:00:00.000Z' : '2026-03-01T08:00:00.000Z',
		author_id: userId, actor_name: 'Аня', amount: index === 0 ? 9.8 : index === eventCount - 1 ? 12.7 : 80,
		unit: index === 0 || index === eventCount - 1 ? 'кг' : 'г', label: null, note: null,
		created_at: '2000-01-01T00:00:00.000Z'
	}));
	const schedules = Array.from({ length: scheduleCount }, (_, index) => ({
		id: rowId(index), pet_id: pets[0].id, kind: 'meal', title: `Кормление ${index + 1}`,
		local_time: '08:00:00', timezone: 'Europe/Moscow', weekdays: [0, 1, 2, 3, 4, 5, 6], is_active: true,
		created_at: '2000-01-01T00:00:00.000Z'
	}));
	return { pets, care_events: events, care_schedules: schedules };
}

async function startFamilyExport(page: Page, options: { failSecondEventPage?: boolean; holdSecondPetPage?: boolean } = {}) {
	const rows = makeRows();
	const pageRequests: Record<TableName, ExportPage[]> = { pets: [], care_events: [], care_schedules: [] };
	const unexpectedRequests: string[] = [];
	const pageErrors: string[] = [];
	let familyMemberReads = 0;
	const initialTableReads = { pets: 0, care_events: 0, care_schedules: 0 };
	let resolveJoin!: (join: JoinMessage) => void;
	const joinReceived = new Promise<JoinMessage>((resolve) => { resolveJoin = resolve; });
	let resolveHeldPage!: () => void;
	const heldPageReached = new Promise<void>((resolve) => { resolveHeldPage = resolve; });
	let releaseHeldPage!: () => void;
	const heldPageGate = new Promise<void>((resolve) => { releaseHeldPage = resolve; });
	let heldPage = false;
	let socketJoined = false;

	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.route('https://outbox-test.supabase.co/**', async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const corsHeaders = {
			'access-control-allow-origin': '*',
			'access-control-allow-methods': 'GET, POST, OPTIONS',
			'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
			'access-control-expose-headers': 'content-range, x-supabase-api-version'
		};
		const respond = (status: number, body: unknown) => route.fulfill({
			status, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(body)
		});
		if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: corsHeaders }); return; }
		if (url.pathname === '/auth/v1/user' && request.method() === 'GET') {
			await respond(200, {
				id: userId, aud: 'authenticated', role: 'authenticated', email: 'family@example.test',
				app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: 'Аня' }
			});
			return;
		}
		if (url.pathname === '/rest/v1/family_members' && request.method() === 'GET') {
			await respond(200, [{ family_id: familyId, role: 'owner', families: { name: 'Семья' } }]);
			familyMemberReads++;
			return;
		}
		if (url.pathname === '/rest/v1/push_subscriptions' && request.method() === 'GET') { await respond(200, []); return; }
		const table = url.pathname.split('/').at(-1) as TableName;
		if ((table === 'pets' || table === 'care_events' || table === 'care_schedules') && request.method() === 'GET') {
			const isExport = url.searchParams.has('created_at');
			if (!isExport) {
				await respond(200, table === 'pets' ? [{ ...rows.pets[0], created_at: undefined }] : table === 'care_events' ? [] : []);
				initialTableReads[table]++;
				return;
			}
			const afterFilter = url.searchParams.get('id');
			const afterId = afterFilter?.startsWith('gt.') ? afterFilter.slice(3) : null;
			const limit = Number(url.searchParams.get('limit') ?? 1000);
			pageRequests[table].push({ afterId, limit });
			if (options.failSecondEventPage && table === 'care_events' && afterId === rowId(499)) {
				await respond(503, { message: 'The second event page failed.' });
				return;
			}
			if (options.holdSecondPetPage && table === 'pets' && afterId === rowId(499) && !heldPage) {
				heldPage = true;
				resolveHeldPage();
				await heldPageGate;
			}
			const tableRows = rows[table] as Array<{ id: string }>;
			const pageRows = tableRows.filter((row) => !afterId || row.id > afterId).slice(0, limit);
			await respond(200, pageRows);
			return;
		}
		unexpectedRequests.push(`${request.method()} ${url.pathname}`);
		await respond(404, { message: `Unexpected Supabase request: ${request.method()} ${url.pathname}` });
	});

	await page.routeWebSocket((url) => url.hostname === 'outbox-test.supabase.co' && url.pathname === '/realtime/v1/websocket', (socket) => {
		socket.onMessage((message) => {
			if (typeof message !== 'string') return;
			const [joinRef, ref, topic, event] = JSON.parse(message) as [string | null, string, string, string];
			if (event !== 'phx_join' || socketJoined) return;
			socketJoined = true;
			resolveJoin({ topic, joinRef, ref, send: (reply) => socket.send(reply) });
			socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
		});
	});

	await page.addInitScript(({ seededUserId }) => {
		localStorage.setItem('sb-outbox-test-auth-token', JSON.stringify({
			access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer',
			expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
			user: { id: seededUserId, aud: 'authenticated', role: 'authenticated', email: 'family@example.test',
				app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { display_name: 'Аня' } }
		}));
	}, { seededUserId: userId });
	await page.goto('http://127.0.0.1:4174/');
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByRole('heading', { name: 'День Собака 1' })).toBeVisible();
	await expect(page.locator('.cloud-error')).toHaveCount(0);

	return {
		pageRequests, unexpectedRequests, pageErrors, joinReceived, heldPageReached, releaseHeldPage,
		getFamilyMemberReads: () => familyMemberReads,
		getInitialLoadReads: () => [familyMemberReads, initialTableReads.pets, initialTableReads.care_events, initialTableReads.care_schedules]
	};
}

async function openBackupSettings(page: Page) {
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Скачать резервную копию' })).toBeEnabled();
}

test('exports every family page and derives the newest weight by event time', async ({ page }) => {
	const state = await startFamilyExport(page);
	await openBackupSettings(page);
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Скачать резервную копию' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('lapki-backup.json');
	const downloadPath = await download.path();
	if (!downloadPath) throw new Error('The browser did not save the family backup');
	const backup = JSON.parse(await readFile(downloadPath, 'utf8')) as {
		pets: Array<{ id: string; weightKg: number }>;
		events: Array<{ id: string; kind?: string; amount?: number; unit?: string }>;
		schedules: Array<{ id: string; timezone?: string; time?: string }>;
	};
	expect(backup.pets.map((pet) => pet.id)).toEqual(Array.from({ length: petCount }, (_, index) => rowId(index)));
	expect(backup.events.map((event) => event.id).sort()).toEqual(Array.from({ length: eventCount }, (_, index) => rowId(index)).sort());
	expect(backup.schedules.map((schedule) => schedule.id)).toEqual(Array.from({ length: scheduleCount }, (_, index) => rowId(index)));
	expect(backup.pets[0]).toMatchObject({ id: rowId(0), weightKg: 12.7 });
	expect(backup.pets.at(-1)?.id).toBe(rowId(petCount - 1));
	expect(backup.events).toContainEqual(expect.objectContaining({ id: rowId(eventCount - 1), kind: 'weight', amount: 12.7, unit: 'кг' }));
	expect(backup.schedules[0]).toMatchObject({ timezone: 'Europe/Moscow', time: '08:00' });
	for (const table of ['pets', 'care_events', 'care_schedules'] as const) {
		expect(state.pageRequests[table]).toEqual([
			{ afterId: null, limit: 500 },
			{ afterId: rowId(499), limit: 500 }
		]);
	}
	expect(state.unexpectedRequests).toEqual([]);
	expect(state.pageErrors).toEqual([]);
});

test('does not download a partial family backup when a later page fails', async ({ page }) => {
	const state = await startFamilyExport(page, { failSecondEventPage: true });
	await openBackupSettings(page);
	let downloadCount = 0;
	page.on('download', () => downloadCount++);
	await page.getByRole('button', { name: 'Скачать резервную копию' }).click();
	await expect.poll(() => state.pageRequests.care_events.length).toBe(2);
	await expect(page.locator('.toast')).toHaveText('Не удалось загрузить все данные для резервной копии. Повторите попытку.', { timeout: 15000 });
	expect(state.pageRequests.care_events).toContainEqual({ afterId: rowId(499), limit: 500 });
	await page.waitForTimeout(100);
	expect(downloadCount).toBe(0);
	expect(state.pageErrors).toEqual([]);
	await expect(page.locator('.cloud-error')).toHaveCount(0);
});

test('cancels a family backup when Realtime signals a family change mid-export', async ({ page }) => {
	const state = await startFamilyExport(page, { holdSecondPetPage: true });
	const join = await state.joinReceived;
	expect(join.topic).toBe(`realtime:family:${familyId}`);
	await expect.poll(state.getInitialLoadReads).toEqual([2, 2, 2, 2]);
	await openBackupSettings(page);
	let downloadCount = 0;
	page.on('download', () => downloadCount++);
	await page.getByRole('button', { name: 'Скачать резервную копию' }).click();
	await state.heldPageReached;
	const familyMemberReadsBeforeBroadcast = state.getFamilyMemberReads();
	join.send(JSON.stringify([join.joinRef, 'family-change', join.topic, 'broadcast', { event: 'family-changed', payload: { changed: true } }]));
	await expect.poll(state.getFamilyMemberReads).toBeGreaterThan(familyMemberReadsBeforeBroadcast);
	state.releaseHeldPage();
	await expect(page.locator('.toast')).toHaveText('Создание копии отменено после смены семейного профиля');
	expect(downloadCount).toBe(0);
	expect(state.pageErrors).toEqual([]);
	await expect(page.locator('.cloud-error')).toHaveCount(0);
});
