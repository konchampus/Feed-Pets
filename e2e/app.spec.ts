import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const testDog = {
	id: 'e2e-dog', name: 'Рада', breed: 'Метис', birthday: '', weightKg: 0,
	allergies: '', healthNotes: ''
};

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await page.evaluate((pet) => localStorage.setItem('lapki:pets', JSON.stringify([pet])), testDog);
	await page.reload();
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
});

async function recordMeal(page: Page, grams: string) {
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await page.getByRole('button', { name: 'Кормление', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('#care-amount').fill(grams);
	await dialog.getByRole('button', { name: 'Сохранить отметку' }).click();
}

test('opens dog journal and records a meal', async ({ page }) => {
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
	await expect(dialog).toHaveCount(0);
});

test('starts without a sample dog and lets the family add its own profile', async ({ page }) => {
	await page.evaluate(() => localStorage.clear());
	await page.reload();
	await expect(page.locator('.app-shell')).toHaveAttribute('data-ready', 'true');
	await expect(page.getByRole('heading', { name: 'Добавьте профиль собаки' })).toBeVisible();
	await expect(page.getByText('Мило', { exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: 'Добавить собаку', exact: true }).click();
	await page.locator('#pet-name').fill('Рада');
	await page.locator('#pet-breed').fill('Метис');
	await page.getByRole('button', { name: 'Добавить профиль' }).click();
	await expect(page.getByText('Профиль собаки добавлен')).toBeVisible();
	await page.getByRole('button', { name: 'Главная', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'День Рада' })).toBeVisible();
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
	const scheduleSwitch = page.getByRole('switch', { name: 'Выключить: Вечернее лекарство' });
	await expect(scheduleSwitch).toHaveAttribute('aria-checked', 'true');
	await scheduleSwitch.click();
	const enabledSwitch = page.getByRole('switch', { name: 'Включить: Вечернее лекарство' });
	await expect(enabledSwitch).toHaveAttribute('aria-checked', 'false');
	await page.getByRole('button', { name: 'Удалить напоминание: Вечернее лекарство' }).click();
	await expect(page.getByRole('status')).toHaveText('Напоминание удалено');
	await expect(page.getByText('Добавьте повторяющееся напоминание для кормления, лекарств или визита.')).toBeVisible();
});

test('exports a backup, restores it, and rejects invalid backup data', async ({ page }, testInfo) => {
	await recordMeal(page, '90');
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Скачать резервную копию' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('lapki-backup.json');
	const backupPath = await download.path();
	if (!backupPath) throw new Error('The browser did not save the backup download');
	const backup = JSON.parse(await readFile(backupPath, 'utf8')) as { pets: unknown[]; events: unknown[] };
	expect(backup.pets).toHaveLength(1);
	expect(backup.events).toHaveLength(1);

	await page.getByRole('button', { name: 'История', exact: true }).click();
	await page.getByRole('button', { name: 'Удалить запись' }).click();
	await expect(page.getByText('Кормление · 90 г', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await page.getByRole('button', { name: 'Восстановить из файла' }).click();
	await page.locator('input[type="file"]').setInputFiles(backupPath);
	await expect(page.getByRole('status')).toHaveText('Данные восстановлены');
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
});
