import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('lists every configured page in the navigation', async ({ page }) => {
	await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
});

test('navigates to another page and renders its containers', async ({ page }) => {
	await page.getByRole('link', { name: 'Services', exact: true }).click();

	await expect(page).toHaveURL('/services');
	await expect(page.getByRole('link', { name: /Loopback/ })).toBeVisible();
	// This box only exists on the home page.
	await expect(page.getByRole('link', { name: /Nowhere/ })).toHaveCount(0);
});

test('keeps the navigation on every page', async ({ page }) => {
	await page.goto('/services');

	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revie Dashboard');
	await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
});
