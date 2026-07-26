import { expect, test } from '@playwright/test';
import { chooseFromDropdown } from './dropdown';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('starts on the light theme when nothing was stored', async ({ page }) => {
	await expect(page.locator('html')).toHaveClass('solid solid-light');
});

test('switches the theme and drops the classes of the previous one', async ({ page }) => {
	await chooseFromDropdown(page, 'Theme', 'Glass dark');

	await expect(page.locator('html')).toHaveClass('glass glass-dark');

	await chooseFromDropdown(page, 'Theme', 'Cyber punk');

	await expect(page.locator('html')).toHaveClass('cyber-punk');
});

test('marks the theme that is currently active', async ({ page }) => {
	await chooseFromDropdown(page, 'Theme', 'Cyber punk');
	await page.getByRole('button', { name: 'Theme' }).hover();

	await expect(page.getByRole('button', { name: 'Cyber punk' })).toHaveClass(/font-bold/);
});

test.describe('with an operating system that prefers dark', () => {
	test.use({ colorScheme: 'dark' });

	test('starts on the dark theme', async ({ page }) => {
		await expect(page.locator('html')).toHaveClass('solid solid-dark');
	});
});

test('remembers the theme in a cookie, so the server renders it right away', async ({ page }) => {
	await chooseFromDropdown(page, 'Theme', 'Glass dark');

	const cookie = (await page.context().cookies()).find((item) => item.name === 'theme');

	expect(cookie?.value).toBe('glass-dark');

	// A full load, so the class can only come from the server.
	await page.goto('/');

	await expect(page.locator('html')).toHaveClass('glass glass-dark');
});
