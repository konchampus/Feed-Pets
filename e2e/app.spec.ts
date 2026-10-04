import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const testDog = {
	id: 'e2e-dog', name: 'Рада', breed: 'Метис', birthday: '', weightKg: 0,
	allergies: '', healthNotes: ''
};

test.beforeEach(async ({ page }) => {
	await page.addInitScript((pet) => {
		if (sessionStorage.getItem('e2e-seeded-dog')) return;
		sessionStorage.setItem('e2e-seeded-dog', 'true');
		localStorage.setItem('lapki:pets', JSON.stringify([pet]));
	}, testDog);
	await page.goto('/');
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
});

test('waits for browser idle before loading Three.js', async ({ browser, baseURL }) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	let threeRequested = false;
	page.on('request', (request) => {
		if (/(?:^|\/)three[^/?#]*(?:[?#]|$)/i.test(request.url())) threeRequested = true;
	});
	await page.addInitScript(() => {
		localStorage.setItem('lapki:pets', JSON.stringify([{
			id: 'e2e-dog', name: 'Рада', breed: 'Метис', birthday: '', weightKg: 0,
			allergies: '', healthNotes: ''
		}]));
		const callbacks = new Map<number, IdleRequestCallback>();
		let nextCallbackId = 1;
		let releasedCallbackCount = 0;
		const idleWindow = window as Window & {
			releaseIdleCallbacks?: () => void;
			getPendingIdleCallbackCount?: () => number;
			getReleasedCallbackCount?: () => number;
		};
		Object.defineProperty(window, 'requestIdleCallback', {
			configurable: true,
			value: (callback: IdleRequestCallback) => {
				const callbackId = nextCallbackId++;
				callbacks.set(callbackId, callback);
				return callbackId;
			}
		});
		Object.defineProperty(window, 'cancelIdleCallback', {
			configurable: true,
			value: (callbackId: number) => callbacks.delete(callbackId)
		});
		idleWindow.getPendingIdleCallbackCount = () => callbacks.size;
		idleWindow.getReleasedCallbackCount = () => releasedCallbackCount;
		idleWindow.releaseIdleCallbacks = () => {
			const pendingCallbacks = [...callbacks.values()];
			callbacks.clear();
			for (const callback of pendingCallbacks) {
				releasedCallbackCount++;
				callback({ didTimeout: false, timeRemaining: () => 50 });
			}
		};
	});
	await page.goto(baseURL ?? 'http://127.0.0.1:4173/');
	await expect(page.locator('.bowl-fallback')).toBeVisible();
	await expect.poll(() => page.locator('.bowl-fallback img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(320);
	expect(threeRequested).toBe(false);
	await expect.poll(() => page.evaluate(() => (window as Window & { getPendingIdleCallbackCount: () => number }).getPendingIdleCallbackCount())).toBe(1);
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Внешний вид' })).toBeVisible();
	await expect.poll(() => page.evaluate(() => (window as Window & { getPendingIdleCallbackCount: () => number }).getPendingIdleCallbackCount())).toBe(0);
	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	await expect(page.locator('.bowl-fallback')).toBeVisible();
	expect(threeRequested).toBe(false);
	await expect.poll(() => page.evaluate(() => (window as Window & { getPendingIdleCallbackCount: () => number }).getPendingIdleCallbackCount())).toBe(1);
	await page.evaluate(() => (window as Window & { releaseIdleCallbacks: () => void }).releaseIdleCallbacks());
	expect(await page.evaluate(() => (window as Window & { getReleasedCallbackCount: () => number }).getReleasedCallbackCount())).toBe(1);
	await expect.poll(() => threeRequested).toBe(true);
	await context.close();
});

async function recordMeal(page: Page, grams: string) {
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await page.getByRole('button', { name: 'Кормление', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('#care-amount').fill(grams);
	await dialog.getByRole('button', { name: 'Сохранить отметку' }).click();
}

test('records care with a clear confirmation and shows it in history', async ({ page }) => {
	page.on('pageerror', (error) => console.log(`Browser error: ${error.stack ?? error.message}`));
	page.on('console', (message) => { if (message.type() === 'error') console.log(`Browser console: ${message.text()}`); });
	await expect(page.getByRole('heading', { name: /привет, семья/i })).toBeVisible();
	await page.getByRole('button', { name: 'Кормление', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('#care-amount')).toBeFocused();
	await expect(dialog.locator('#care-amount')).toHaveValue('');
	await dialog.locator('#care-amount').fill('75');
	await page.getByRole('button', { name: 'Сохранить отметку' }).click();
	await expect(page.getByText('Кормление · 75 г', { exact: true })).toBeVisible();
	await expect(page.getByRole('status')).toHaveText('Отметка «Кормление» сохранена');
	await expect(dialog).toHaveCount(0);
	await page.getByRole('button', { name: 'Прогулка', exact: true }).click();
	const walkDialog = page.getByRole('dialog');
	await walkDialog.locator('#care-amount').fill('35');
	await walkDialog.getByRole('button', { name: 'Сохранить отметку' }).click();
	await expect(page.getByRole('status')).toHaveText('Отметка «Прогулка» сохранена');
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByText('Прогулка · 35 мин', { exact: true })).toBeVisible();
});

test('starts without a sample dog and lets the family add its own profile', async ({ page }) => {
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByRole('heading', { name: 'Добавьте профиль собаки' })).toBeVisible();
	await expect.poll(() => page.locator('.empty-art').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(320);
	await expect(page.getByText('Мило', { exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: 'Добавить собаку', exact: true }).click();
	await page.locator('#pet-name').fill('Рада');
	await page.locator('#pet-breed').fill('Метис');
	await page.getByRole('button', { name: 'Добавить профиль' }).click();
	await expect(page.getByText('Профиль собаки добавлен')).toBeVisible();
	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await page.getByRole('button', { name: 'Изменить профиль Рада', exact: true }).click();
	await page.locator('#pet-name').fill('Рада дома');
	await page.locator('#pet-health').fill('Чувствительность к курице');
	await page.locator('#pet-weight').fill('12.4');
	await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Профиль собаки обновлён');
	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'День Рада дома' })).toBeVisible();
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByText('Вес · 12.4 кг', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByRole('heading', { name: 'День Рада дома' })).toBeVisible();
});

test('clears the previous success message when opening family setup', async ({ page }) => {
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');

	await page.getByRole('button', { name: 'Добавить собаку', exact: true }).click();
	await page.locator('#pet-name').fill('Рада');
	await page.locator('#pet-breed').fill('Метис');
	await page.getByRole('button', { name: 'Добавить профиль' }).click();
	await expect(page.getByRole('status')).toHaveText('Профиль собаки добавлен');

	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	await expect(page.getByRole('status')).toHaveCount(0);
	await page.getByRole('button', { name: 'Подключить семью ↗', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Настройки', exact: true })).toBeVisible();
	await expect(page.getByText(/Семейный вход появится после подключения Supabase/)).toBeVisible();
	await expect(page.getByRole('status')).toHaveCount(0);
});

test('first dog setup works on a narrow screen', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Добавьте профиль собаки' })).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.getByRole('button', { name: 'Добавить собаку', exact: true }).click();
	await page.locator('#pet-name').fill('Рада');
	await page.locator('#pet-breed').fill('Метис');
	await page.getByRole('button', { name: 'Добавить профиль' }).click();
	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	const editButton = page.getByRole('button', { name: 'Изменить профиль Рада', exact: true });
	const editButtonSize = await editButton.evaluate((button) => {
		const { width, height } = button.getBoundingClientRect();
		return { width, height };
	});
	expect(editButtonSize.width).toBeGreaterThanOrEqual(44);
	expect(editButtonSize.height).toBeGreaterThanOrEqual(44);
	await editButton.click();
	await expect(page.getByRole('heading', { name: 'Профиль: Рада' })).toBeVisible();
	const cancelButtonSize = await page.getByRole('button', { name: 'Отмена' }).evaluate((button) => {
		const { width, height } = button.getBoundingClientRect();
		return { width, height };
	});
	expect(cancelButtonSize.width).toBeGreaterThanOrEqual(44);
	expect(cancelButtonSize.height).toBeGreaterThanOrEqual(44);
	await page.locator('#pet-name').fill('ОченьДлинноеИмяСобаки'.repeat(4).slice(0, 80));
	await page.locator('#pet-breed').fill('ПородаБезПробелов'.repeat(6).slice(0, 100));
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.locator('#pet-name').fill('Рада');
	await page.locator('#pet-breed').fill('Метис');
	await page.locator('#pet-weight').fill('200.1');
	const saveButton = page.getByRole('button', { name: 'Сохранить изменения' });
	const saveButtonSize = await saveButton.evaluate((button) => {
		const { width, height } = button.getBoundingClientRect();
		return { width, height };
	});
	expect(saveButtonSize.height).toBeGreaterThanOrEqual(44);
	await saveButton.click();
	await expect(page.getByRole('status')).toHaveText('Вес должен быть от 0,1 до 200 кг');
	await page.locator('#pet-weight').fill('12.4');
	await page.getByRole('button', { name: 'Сохранить изменения' }).click();
	await expect(page.getByRole('status')).toHaveText('Профиль собаки обновлён');
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByText('Вес · 12.4 кг', { exact: true })).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('keeps old local care records when replacing the former starter profile', async ({ page }) => {
	await page.evaluate(() => {
		localStorage.clear();
		localStorage.setItem('lapki:pets', JSON.stringify([{
			id: 'milo', name: 'Мило', breed: 'Корги', birthday: '2022-04-16', weightKg: 12.4, allergies: '', healthNotes: ''
		}]));
		localStorage.setItem('lapki:events', JSON.stringify([{
			id: 'legacy-meal', petId: 'milo', kind: 'meal', occurredAt: '2026-10-02T08:00:00.000Z', by: 'Я', amount: 80, unit: 'г'
		}]));
		localStorage.setItem('lapki:schedules', JSON.stringify([{
			id: 'legacy-schedule', petId: 'milo', kind: 'meal', title: 'Старое кормление', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true
		}]));
	});
	await page.reload();
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByRole('heading', { name: 'Добавьте профиль собаки' })).toBeVisible();
	await expect(page.getByText('Мило', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByText('Кормление · 80 г', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Расписание', exact: true }).click();
	await expect(page.getByText(/Сохранено напоминаний: 1/)).toBeVisible();
	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	await page.getByRole('button', { name: 'Добавить собаку', exact: true }).click();
	await page.locator('#pet-name').fill('Рада');
	await page.locator('#pet-breed').fill('Метис');
	await page.getByRole('button', { name: 'Добавить профиль' }).click();
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByText('Кормление · 80 г', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Расписание', exact: true }).click();
	await expect(page.getByText('Старое кормление', { exact: true })).toBeVisible();
});

test('lets the family choose which saved dog receives old records', async ({ page }) => {
	await page.evaluate((dog) => {
		localStorage.clear();
		localStorage.setItem('lapki:pets', JSON.stringify([
			{ id: 'milo', name: 'Мило', breed: 'Корги', birthday: '2022-04-16', weightKg: 12.4, allergies: '', healthNotes: '' },
			{ ...dog, id: 'rada', name: 'Рада' },
			{ ...dog, id: 'bim', name: 'Бим' }
		]));
		localStorage.setItem('lapki:events', JSON.stringify([
			{ id: 'legacy-meal', petId: 'milo', kind: 'meal', occurredAt: '2026-10-02T08:00:00.000Z', by: 'Я', amount: 80, unit: 'г' }
		]));
		localStorage.setItem('lapki:schedules', JSON.stringify([
			{ id: 'legacy-schedule', petId: 'milo', kind: 'meal', title: 'Старое кормление', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], enabled: true }
		]));
	}, testDog);
	await page.reload();
	await expect(page.getByRole('note')).toContainText('В старом стартовом профиле осталось записей: 1, напоминаний: 1.');
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await expect(page.getByText(/Старые записи: 1 · напоминания: 1/)).toBeVisible();
	await page.getByRole('button', { name: 'Перенести данные к Бим', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Старые данные привязаны к собаке Бим');
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByRole('heading', { name: /История Бим/i })).toBeVisible();
	await expect(page.getByText('Кормление · 80 г', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Расписание', exact: true }).click();
	await expect(page.getByText('Старое кормление', { exact: true })).toBeVisible();
	await expect(page.getByText(/Сохранено напоминаний/)).toHaveCount(0);
});

test('empty history opens the first meal form', async ({ page }) => {
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await page.getByRole('button', { name: 'Отметить кормление', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Кормление' })).toBeVisible();
});

test('rejects invalid care amounts and keeps the dialog open', async ({ page }) => {
	await page.getByRole('button', { name: 'Кормление', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.locator('#care-amount')).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(dialog.getByRole('button', { name: 'Сохранить отметку' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'Кормление', exact: true })).toBeFocused();

	await page.getByRole('button', { name: 'Кормление', exact: true }).click();
	await dialog.locator('#care-amount').fill('-5');
	await dialog.getByRole('button', { name: 'Сохранить отметку' }).click();
	await expect(page.getByRole('status')).toHaveText('Проверьте допустимое количество');
	await expect(dialog).toBeVisible();
	await expect(page.getByText('Кормление · -5 г', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Сохранить отметку' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Кормление', exact: true })).toBeFocused();
});

test('navigates history and adds, toggles, and deletes a schedule', async ({ page }) => {
	await recordMeal(page, '75');
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByRole('heading', { name: /история рада/i })).toBeVisible();
	await expect(page.getByText('Кормление · 75 г', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Расписание', exact: true }).click();
	await page.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Укажите, о чём напомнить');
	await expect(page.getByText('Добавьте повторяющееся напоминание для кормления, лекарств или визита.')).toBeVisible();
	await page.locator('#schedule-title').fill('Вечернее лекарство');
	await page.locator('#schedule-kind').selectOption({ label: 'Лекарство' });
	await page.locator('#schedule-time').fill('20:30');
	await page.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByText(/расписание сохранено только здесь и не отправляет уведомления/i)).toBeVisible();
	const scheduleSwitch = page.getByRole('switch', { name: 'Выключить: Вечернее лекарство' });
	await expect(scheduleSwitch).toHaveAttribute('aria-checked', 'true');
	await scheduleSwitch.click();
	const enabledSwitch = page.getByRole('switch', { name: 'Включить: Вечернее лекарство' });
	await expect(enabledSwitch).toHaveAttribute('aria-checked', 'false');
	await page.getByRole('button', { name: 'Удалить напоминание: Вечернее лекарство' }).click();
	await expect(page.getByRole('status')).toHaveText('Напоминание удалено');
	await expect(page.getByText('Добавьте повторяющееся напоминание для кормления, лекарств или визита.')).toBeVisible();
});

test('shows the nearest future reminder on the home screen', async ({ page }) => {
	await page.clock.install({ time: new Date(2026, 9, 4, 12, 0) });
	await page.reload();
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await page.getByRole('button', { name: 'Расписание', exact: true }).click();

	await page.locator('#schedule-title').fill('Утренний корм');
	await page.locator('#schedule-time').fill('08:00');
	await page.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Напоминание добавлено');

	await page.locator('#schedule-title').fill('Вечерняя прогулка');
	await page.locator('#schedule-time').fill('19:00');
	await page.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Напоминание добавлено');

	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	const reminderCard = page.locator('.reminder-card');
	await expect(reminderCard.locator('strong')).toHaveText('Вечерняя прогулка');
	const deviceTimeZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
	await expect(reminderCard.locator('small')).toHaveText(`Сегодня · 19:00 · ${deviceTimeZone}`);
});

test('shows a family schedule in the timezone saved with it', async ({ browser }) => {
	const context = await browser.newContext({ timezoneId: 'Pacific/Honolulu', viewport: { width: 1365, height: 900 } });
	const page = await context.newPage();
	await page.addInitScript((pet) => {
		const originalDate = Date;
		const fixedTime = originalDate.parse('2026-01-15T09:00:00.000Z');
		const fixedDate = new Proxy(originalDate, {
			construct(target, args) { return Reflect.construct(target, args.length ? args : [fixedTime]); },
			apply() { return new originalDate(fixedTime).toString(); }
		});
		Object.defineProperty(fixedDate, 'now', { value: () => fixedTime });
		Object.defineProperty(window, 'Date', { value: fixedDate });
		localStorage.setItem('lapki:pets', JSON.stringify([pet]));
		localStorage.setItem('lapki:schedules', JSON.stringify([{
			id: 'tokyo-evening', petId: 'e2e-dog', kind: 'meal', title: 'Вечерний корм', time: '19:00', timezone: 'Asia/Tokyo',
			days: [0, 1, 2, 3, 4, 5, 6], enabled: true
		}]));
	}, testDog);
	await page.goto('http://127.0.0.1:4173/');
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await expect(page.locator('.reminder-card small')).toHaveText('Сегодня · 19:00 · Asia/Tokyo');
	await page.getByRole('button', { name: 'Расписание', exact: true }).click();
	await expect(page.locator('.schedule-timezone')).toHaveText('Пояс: Asia/Tokyo');
	await context.close();
});

test('exports a backup, restores it, and rejects invalid backup data', async ({ page }, testInfo) => {
	await page.evaluate(() => localStorage.setItem('lapki:schedules', JSON.stringify([{
		id: 'tokyo-evening', petId: 'e2e-dog', kind: 'meal', title: 'Вечерний корм', time: '19:00', timezone: 'Asia/Tokyo',
		days: [0, 1, 2, 3, 4, 5, 6], enabled: true
	}])));
	await page.reload();
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await recordMeal(page, '90');
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Скачать резервную копию' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('lapki-backup.json');
	const backupPath = await download.path();
	if (!backupPath) throw new Error('The browser did not save the backup download');
	const backup = JSON.parse(await readFile(backupPath, 'utf8')) as { pets: unknown[]; events: unknown[]; schedules: Array<{ timezone?: string }> };
	expect(backup.pets).toHaveLength(1);
	expect(backup.events).toHaveLength(1);
	expect(backup.schedules).toContainEqual(expect.objectContaining({ timezone: 'Asia/Tokyo' }));

	await page.getByRole('button', { name: 'История', exact: true }).click();
	await page.getByRole('button', { name: 'Удалить запись' }).click();
	await expect(page.getByText('Кормление · 90 г', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await page.getByRole('button', { name: 'Восстановить из файла' }).click();
	await page.locator('input[type="file"]').setInputFiles(backupPath);
	await expect(page.getByRole('status')).toHaveText('Данные восстановлены');
	await page.getByRole('button', { name: 'Расписание', exact: true }).click();
	await expect(page.locator('.schedule-timezone')).toHaveText('Пояс: Asia/Tokyo');
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByText('Кормление · 90 г', { exact: true })).toBeVisible();

	const invalidBackupPath = testInfo.outputPath('invalid-backup.json');
	await writeFile(invalidBackupPath, '{"pets":[{}],"events":[]}');
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await page.getByRole('button', { name: 'Восстановить из файла' }).click();
	await page.locator('input[type="file"]').setInputFiles(invalidBackupPath);
	await expect(page.getByRole('status')).toHaveText('Файл резервной копии не распознан');
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByText('Кормление · 90 г', { exact: true })).toBeVisible();
});

test('keeps navigation and main screens usable on a narrow viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const bottomNav = page.getByRole('navigation', { name: 'Основная навигация' });
	await expect(bottomNav).toBeVisible();
	await expect(bottomNav.getByRole('button', { name: 'Главная' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('heading', { name: /привет, семья/i })).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(bottomNav.getByRole('button', { name: 'История' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('heading', { name: /история рада/i })).toBeVisible();
	await page.getByRole('button', { name: 'Расписание', exact: true }).click();
	await expect(page.getByRole('heading', { name: /расписание дел/i })).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	const longTitle = 'ДлинноеНапоминаниеБезПробеловДляПроверкиМобильногоПереносаСтроки';
	await page.locator('#schedule-title').fill(longTitle);
	await page.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByText(longTitle, { exact: true })).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.getByRole('switch', { name: `Выключить: ${longTitle}` }).click();
	await expect(page.getByRole('switch', { name: `Включить: ${longTitle}` })).toHaveAttribute('aria-checked', 'false');
	await page.getByRole('button', { name: `Удалить напоминание: ${longTitle}` }).click();
	await expect(page.getByText(longTitle, { exact: true })).toHaveCount(0);
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
	await expect(page.getByText(/на этом устройстве/i)).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	await expect(page.locator('.pet-initial')).toContainText('Р');
	await page.getByRole('button', { name: 'Кормление', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('loads the cached journal and records care while offline', async ({ page, context }) => {
	await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15000 }).toBe(true);
	await page.reload();
	await expect(page.getByRole('heading', { name: /привет, семья/i })).toBeVisible();
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');

	await context.setOffline(true);
	try {
		await page.reload();
		await expect(page.getByRole('heading', { name: /привет, семья/i })).toBeVisible();
		await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
		await recordMeal(page, '55');
		await expect(page.getByText('Кормление · 55 г', { exact: true })).toBeVisible();
	} finally {
		await context.setOffline(false);
	}
});

test('opens settings with local mode and privacy status', async ({ page }) => {
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
	await expect(page.getByText(/на этом устройстве/i)).toBeVisible();
	await expect(page.getByText(/для push подключите supabase и задайте публичный vapid key/i)).toBeVisible();
	const sceneToggle = page.getByRole('checkbox', { name: '3D-миска' });
	await expect(sceneToggle).toBeChecked();
	await sceneToggle.uncheck();
	await page.reload();
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
	await expect(sceneToggle).not.toBeChecked();
	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	await expect.poll(() => page.locator('.bowl-static img').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(320);
});
