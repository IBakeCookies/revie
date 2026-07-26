import { expect, test } from '@playwright/test';
import { chooseFromDropdown } from './dropdown';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('serves the base locale when nothing was stored', async ({ page }) => {
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('button', { name: 'Language' })).toBeVisible();
});

test('switches to German', async ({ page }) => {
	await chooseFromDropdown(page, 'Language', 'German');

	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.getByRole('button', { name: 'Sprache' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Design' })).toBeVisible();
});

test('translates the theme names too', async ({ page }) => {
	await chooseFromDropdown(page, 'Language', 'German');
	await page.getByRole('button', { name: 'Design' }).hover();

	await expect(page.getByRole('button', { name: 'Glas dunkel' })).toBeVisible();
});

test('remembers the language across a full load', async ({ page }) => {
	await chooseFromDropdown(page, 'Language', 'German');
	await page.goto('/services');

	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	await expect(page.getByRole('button', { name: 'Sprache' })).toBeVisible();
});
