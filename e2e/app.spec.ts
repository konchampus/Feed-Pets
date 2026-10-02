import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
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
	await dialog.locator('#care-amount').fill('75');
	await page.getByRole('button', { name: 'Сохранить отметку' }).click();
	await expect(page.getByText('Кормление · 75 г', { exact: true })).toBeVisible();
	await expect(dialog).toHaveCount(0);
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

test('navigates history and adds and toggles a schedule', async ({ page }) => {
	await recordMeal(page, '75');
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByRole('heading', { name: /история мило/i })).toBeVisible();
	await expect(page.getByText('Кормление · 75 г', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Расписание', exact: true }).click();
	await page.getByRole('button', { name: 'Добавить', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Укажите, о чём напомнить');
	await expect(page.getByText('Добавьте повторяющееся напоминание для кормления, лекарств или визита.')).toBeVisible();
	await page.locator('#schedule-title').fill('Вечернее лекарство');
	await page.locator('#schedule-kind').selectOption({ label: 'Лекарство' });
	await page.locator('#schedule-time').fill('20:30');
	await page.getByRole('button', { name: 'Добавить', exact: true }).click();
	const scheduleSwitch = page.getByRole('switch', { name: 'Вечернее лекарство' });
	await expect(scheduleSwitch).toHaveAttribute('aria-checked', 'true');
	await scheduleSwitch.click();
	await expect(scheduleSwitch).toHaveAttribute('aria-checked', 'false');
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
	await expect(page.getByRole('heading', { name: /привет, семья/i })).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await page.getByRole('button', { name: 'История', exact: true }).click();
	await expect(page.getByRole('heading', { name: /история мило/i })).toBeVisible();
	await page.getByRole('button', { name: 'Расписание', exact: true }).click();
	await expect(page.getByRole('heading', { name: /расписание дел/i })).toBeVisible();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('opens settings with local mode and privacy status', async ({ page }) => {
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
	await expect(page.getByText(/на этом устройстве/i)).toBeVisible();
});
