import { expect, test } from '@playwright/test';

test('opens dog journal and records a meal', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /привет, семья/i })).toBeVisible();
	await page.getByRole('button', { name: 'Кормление', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.locator('#care-amount').fill('75');
	await page.getByRole('button', { name: 'Сохранить отметку' }).click();
	await expect(page.getByText('75 г')).toBeVisible();
});

test('opens settings with local mode and privacy status', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Настройки', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
	await expect(page.getByText(/на этом устройстве/i)).toBeVisible();
});
