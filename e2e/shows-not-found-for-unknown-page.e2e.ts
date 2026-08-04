import { expect, test } from '@playwright/test';

test('answers 404 and names the page that is missing', async ({ page }) => {
	const response = await page.goto('/nope');

	expect(response?.status()).toBe(404);

	await expect(
		page.getByRole('heading', {
			name: '404',
		}),
	).toBeVisible();

	await expect(page.getByText('No dashboard page is configured for "/nope"')).toBeVisible();
});

test('keeps the navigation, so the dashboard can be reached again', async ({ page }) => {
	await page.goto('/nope');

	await page
		.getByRole('link', {
			name: 'Home',
			exact: true,
		})
		.click();

	await expect(
		page.getByRole('heading', {
			name: 'Services',
		}),
	).toBeVisible();
});
