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

test('retries family writes and protects cloud schedule creation', async ({ browser, baseURL }) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	let serverEvents: Record<string, unknown>[] = [];
	let offlineMode = false;
	let offlineRequestCount = 0;
	let refreshAttempts = 0;
	let membershipReads = 0;
	let insertAttempts = 0;
	let pushAttempts = 0;
	let petUpdateAttempts = 0;
	let petDeleteAttempts = 0;
	let eventDeleteAttempts = 0;
	let scheduleUpdateAttempts = 0;
	let scheduleDraftUpdateAttempts = 0;
	let scheduleDeleteAttempts = 0;
	let scheduleInsertAttempts = 0;
	let releaseFirstScheduleInsert: (() => void) | undefined;
	const firstScheduleInsert = new Promise<void>((resolve) => { releaseFirstScheduleInsert = resolve; });
	const scheduleRows: Record<string, unknown>[] = [{
		id: '123e4567-e89b-12d3-a456-426614174003',
		pet_id: '123e4567-e89b-12d3-a456-426614174002',
		kind: 'meal',
		title: 'Утреннее кормление',
		local_time: '08:00:00',
		timezone: 'Europe/Moscow',
		weekdays: [0, 1, 2, 3, 4, 5, 6],
		is_active: true
	}];
	const scheduleRequestIds: string[] = [];
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
		if (offlineMode) { offlineRequestCount++; await route.abort('failed'); return; }
		if (url.pathname === '/auth/v1/token') {
			refreshAttempts++;
			await respond(200, {
				access_token: 'refreshed-access-token',
				refresh_token: 'refreshed-refresh-token',
				token_type: 'bearer',
				expires_in: 3600,
				user: testUser
			});
			return;
		}
		if (url.pathname === '/auth/v1/user') {
			await respond(200, testUser);
			return;
		}
		if (url.pathname === '/rest/v1/family_members') {
			membershipReads++;
			await respond(200, [{ family_id: '123e4567-e89b-12d3-a456-426614174001', role: 'owner', families: { name: 'Семья' } }]);
			return;
		}
		if (url.pathname === '/rest/v1/pets' && request.method() === 'GET') {
			await respond(200, [{
				id: '123e4567-e89b-12d3-a456-426614174002',
				name: 'Рада',
				breed: 'Метис',
				birthday: null,
				photo_url: null,
				allergies: '',
				health_notes: ''
			}, {
				id: '123e4567-e89b-12d3-a456-426614174004',
				name: 'Бета',
				breed: 'Метис',
				birthday: null,
				photo_url: null,
				allergies: '',
				health_notes: ''
			}]);
			return;
		}
		if (url.pathname === '/rest/v1/pets' && request.method() === 'PATCH') {
			petUpdateAttempts++;
			await respond(200, []);
			return;
		}
		if (url.pathname === '/rest/v1/pets' && request.method() === 'DELETE') {
			petDeleteAttempts++;
			await respond(200, []);
			return;
		}
		if (url.pathname === '/rest/v1/care_events' && request.method() === 'DELETE') {
			eventDeleteAttempts++;
			await respond(200, []);
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
		if (url.pathname === '/rest/v1/care_schedules' && request.method() === 'GET') {
			const scheduleId = url.searchParams.get('id')?.replace(/^eq\./, '');
			await respond(200, scheduleRows.filter((row) => !scheduleId || row.id === scheduleId));
			return;
		}
		if (url.pathname === '/rest/v1/care_schedules' && request.method() === 'PATCH') {
			const updates = request.postDataJSON() as Record<string, unknown>;
			if ('title' in updates) {
				scheduleDraftUpdateAttempts++;
				const scheduleId = url.searchParams.get('id')?.replace(/^eq\./, '');
				const existingSchedule = scheduleRows.find((row) => row.id === scheduleId);
				if (existingSchedule) Object.assign(existingSchedule, { ...updates, local_time: `${updates.local_time}:00` });
				await respond(200, existingSchedule ? [{ id: scheduleId }] : []);
				return;
			}
			scheduleUpdateAttempts++;
			await respond(200, []);
			return;
		}
		if (url.pathname === '/rest/v1/care_schedules' && request.method() === 'POST') {
			scheduleInsertAttempts++;
			const payload = request.postDataJSON() as Record<string, unknown>;
			const newSchedule = { ...payload, is_active: true, local_time: `${payload.local_time}:00`, created_by: testUser.id };
			scheduleRequestIds.push(String(newSchedule.id));
			if (scheduleInsertAttempts === 1) {
				await firstScheduleInsert;
				scheduleRows.push(newSchedule);
				await route.abort('failed');
				return;
			}
			if (scheduleInsertAttempts === 2) {
				await respond(409, { code: '23505', message: 'Schedule already exists.' });
				return;
			}
			if (scheduleInsertAttempts === 3) {
				await respond(503, { message: 'Schedule storage is temporarily unavailable.' });
				return;
			}
			if (scheduleInsertAttempts === 4) {
				await route.abort('failed');
				return;
			}
			scheduleRows.push(newSchedule);
			await respond(201, { id: newSchedule.id });
			return;
		}
		if (url.pathname === '/rest/v1/care_schedules' && request.method() === 'DELETE') {
			scheduleDeleteAttempts++;
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
		let testNow = Date.now();
		Date.now = () => testNow;
		(window as Window & { advanceTestTime?: (milliseconds: number) => void }).advanceTestTime = (milliseconds) => { testNow += milliseconds; };
		const originalSetTimeout = window.setTimeout.bind(window);
		window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
			if (timeout === 65_000) {
				(window as Window & { authRetryScheduled?: boolean }).authRetryScheduled = true;
				return originalSetTimeout(handler, 20, ...args);
			}
			return originalSetTimeout(handler, timeout, ...args);
		}) as typeof window.setTimeout;
		const createObjectURL = URL.createObjectURL.bind(URL);
		URL.createObjectURL = ((blob: Blob) => {
			if (blob.type === 'application/json') {
				const exportWindow = window as Window & { lapkiBackupJson?: string };
				void blob.text().then((text) => { exportWindow.lapkiBackupJson = text; });
			}
			return createObjectURL(blob);
		}) as typeof URL.createObjectURL;
		if (!localStorage.getItem('sb-outbox-test-auth-token')) localStorage.setItem('sb-outbox-test-auth-token', JSON.stringify({
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
		await page.getByRole('button', { name: 'Расписание', exact: true }).click();
		await expect(page.locator('.schedule-timezone')).toHaveText('Пояс: Europe/Moscow');
		await page.getByRole('button', { name: 'Главная', exact: true }).click();
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
		await page.getByRole('button', { name: 'Настройки', exact: true }).click();
		await page.getByRole('button', { name: 'Изменить профиль Рада', exact: true }).click();
		await page.locator('#pet-name').fill('Рада новая');
		await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
		await expect(page.locator('.toast')).toHaveText('Не удалось изменить профиль собаки');
		expect(petUpdateAttempts).toBe(1);
		await page.getByRole('button', { name: 'Главная', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
		await page.getByRole('button', { name: 'История', exact: true }).click();
		await page.getByRole('button', { name: 'Удалить запись' }).first().click();
		await expect(page.locator('.toast')).toHaveText('Не удалось удалить запись');
		expect(eventDeleteAttempts).toBe(1);
		await expect(page.getByText('Кормление · 95 г', { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Расписание', exact: true }).click();
		await page.locator('#schedule-title').fill('Вечернее лекарство');
		await page.locator('#schedule-kind').selectOption('medicine');
		const addScheduleButton = page.locator('.schedule-compose button.primary-button');
		await addScheduleButton.click();
		await expect.poll(() => scheduleInsertAttempts).toBe(1);
		await expect(addScheduleButton).toBeDisabled();
		await addScheduleButton.dispatchEvent('click');
		expect(scheduleInsertAttempts).toBe(1);
		releaseFirstScheduleInsert?.();
		await expect(page.locator('.toast')).toHaveText('Не удалось сохранить напоминание');
		await expect(page.locator('#schedule-title')).toHaveValue('Вечернее лекарство');
		expect(scheduleRows.filter((row) => row.title === 'Вечернее лекарство')).toHaveLength(1);
		await page.locator('#schedule-title').fill('Вечерняя таблетка');
		await page.locator('#schedule-time').fill('21:10');
		await addScheduleButton.click();
		await expect(page.locator('.toast')).toHaveText('Напоминание добавлено');
		await expect(page.getByRole('button', { name: 'Удалить напоминание: Вечерняя таблетка' })).toBeVisible();
		expect(scheduleInsertAttempts).toBe(2);
		expect(scheduleRequestIds[1]).toBe(scheduleRequestIds[0]);
		expect(scheduleDraftUpdateAttempts).toBe(1);
		expect(scheduleRows.filter((row) => row.title === 'Вечерняя таблетка')).toHaveLength(1);
		expect(scheduleRows.filter((row) => row.title === 'Вечернее лекарство')).toHaveLength(0);
		expect(scheduleRows.find((row) => row.title === 'Вечерняя таблетка')?.local_time).toBe('21:10:00');
		expect(scheduleRows.find((row) => row.title === 'Вечерняя таблетка')?.timezone).toBe(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone));

		await page.locator('#schedule-title').fill('После прогулки');
		await addScheduleButton.click();
		await expect(page.locator('.toast')).toHaveText('Не удалось сохранить напоминание');
		await expect(page.locator('#schedule-title')).toHaveValue('После прогулки');
		expect(scheduleInsertAttempts).toBe(3);
		await addScheduleButton.click();
		await expect(page.locator('.toast')).toHaveText('Не удалось сохранить напоминание');
		await expect(page.locator('#schedule-title')).toHaveValue('После прогулки');
		expect(scheduleInsertAttempts).toBe(4);
		await addScheduleButton.click();
		await expect(page.locator('.toast')).toHaveText('Напоминание добавлено');
		await expect(page.getByRole('button', { name: 'Удалить напоминание: После прогулки' })).toBeVisible();
		expect(scheduleInsertAttempts).toBe(5);

		const scheduleSwitch = page.getByRole('switch', { name: 'Выключить: Утреннее кормление' });
		await scheduleSwitch.click();
		await expect(page.locator('.toast')).toHaveText('Не удалось обновить напоминание');
		expect(scheduleUpdateAttempts).toBe(1);
		await expect(scheduleSwitch).toHaveAttribute('aria-checked', 'true');
		await page.getByRole('button', { name: 'Удалить напоминание: Утреннее кормление' }).click();
		await expect(page.locator('.toast')).toHaveText('Не удалось удалить напоминание');
		expect(scheduleDeleteAttempts).toBe(1);
		await expect(page.getByText('Утреннее кормление', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Настройки', exact: true }).click();
		page.once('dialog', (dialog) => void dialog.accept());
		await page.getByRole('button', { name: 'Удалить профиль Рада', exact: true }).click();
		await expect(page.locator('.toast')).toHaveText('Не удалось удалить профиль');
		expect(petDeleteAttempts).toBe(1);
		await expect(page.getByRole('button', { name: 'Изменить профиль Рада', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Скачать резервную копию', exact: true }).click();
		await expect(page.locator('.toast')).toHaveText('Полная резервная копия скачана');
		const backupJson = await page.evaluate(() => (window as Window & { lapkiBackupJson?: string }).lapkiBackupJson ?? '');
		const backup = JSON.parse(backupJson) as { schedules: Array<{ timezone?: string }> };
		expect(backup.schedules).toContainEqual(expect.objectContaining({ timezone: 'Europe/Moscow' }));
		expect(await page.evaluate(() => localStorage.getItem('lapki:user:123e4567-e89b-12d3-a456-426614174000:familyId'))).toBe('123e4567-e89b-12d3-a456-426614174001');
		await context.setOffline(true);
		await page.reload();
		await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
		await expect(page.locator('.cloud-error')).toContainText('live-обновления отключены', { timeout: 12000 });
		await expect(page.getByRole('button', { name: 'Переподключить' })).toBeVisible();
		await context.setOffline(false);
		serverEvents.push({
			id: '123e4567-e89b-12d3-a456-426614174005',
			pet_id: '123e4567-e89b-12d3-a456-426614174002',
			kind: 'water',
			occurred_at: new Date().toISOString(),
			author_id: testUser.id,
			actor_name: 'Аня',
			amount: null,
			unit: null,
			label: 'Пропущенное обновление',
			note: null
		});
		await page.getByRole('button', { name: 'Главная', exact: true }).click();
		await page.getByRole('button', { name: 'Переподключить' }).click();
		await expect(page.locator('.timeline .timeline-copy strong').filter({ hasText: 'Вода' })).toBeVisible();
		offlineMode = true;
		await context.setOffline(true);
		await page.evaluate(() => {
			const authKey = 'sb-outbox-test-auth-token';
			const session = JSON.parse(localStorage.getItem(authKey) ?? 'null') as { expires_at?: number } | null;
			if (session) localStorage.setItem(authKey, JSON.stringify({ ...session, expires_at: 1 }));
		});
		await page.reload();
		await expect.poll(() => offlineRequestCount, { timeout: 10000 }).toBeGreaterThan(0);
		await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
		await expect(page.locator('.cloud-error')).toContainText('Показана сохранённая копия', { timeout: 12000 });
		await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
		expect(await page.evaluate(() => {
			const session = JSON.parse(localStorage.getItem('sb-outbox-test-auth-token') ?? 'null') as { user?: { id?: string }; expires_at?: number } | null;
			return { userId: session?.user?.id, expiresAt: session?.expires_at };
		})).toEqual({ userId: testUser.id, expiresAt: 1 });
		await page.getByRole('button', { name: 'Расписание', exact: true }).click();
		await expect(page.getByText('Пояс: Europe/Moscow', { exact: true })).toBeVisible();
		offlineMode = false;
		const readsBeforeRecovery = membershipReads;
		await context.setOffline(false);
		await page.evaluate(() => window.dispatchEvent(new Event('online')));
		const refreshAttemptsBeforeRecovery = refreshAttempts;
		await expect.poll(async () => refreshAttempts > refreshAttemptsBeforeRecovery || await page.evaluate(() => (window as Window & { authRetryScheduled?: boolean }).authRetryScheduled ?? false)).toBe(true);
		if (await page.evaluate(() => (window as Window & { authRetryScheduled?: boolean }).authRetryScheduled ?? false)) {
			await page.evaluate(() => (window as Window & { advanceTestTime: (milliseconds: number) => void }).advanceTestTime(61_000));
		}
		await expect.poll(() => refreshAttempts).toBeGreaterThan(refreshAttemptsBeforeRecovery);
		await expect.poll(() => membershipReads).toBeGreaterThan(readsBeforeRecovery);
		await expect(page.getByRole('heading', { name: 'Расписание дел' })).toBeVisible();
		await expect(page.getByText('Пояс: Europe/Moscow', { exact: true })).toBeVisible();
		await expect(page.locator('.cloud-error')).not.toContainText('Показана сохранённая копия');
		expect(pageErrors).toEqual([]);
	} finally {
		await context.close();
	}
});
