import { expect, test } from '@playwright/test';
import { chooseFromDropdown } from './dropdown';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('starts on the default theme when nothing was stored', async ({ page }) => {
	await expect(page.locator('html')).toHaveClass(/fallow/);
});

test('switches the theme and drops the classes of the previous one', async ({ page }) => {
	await chooseFromDropdown(page, 'Theme', 'Terminal');

	// dark themes carry `dark` too, which is what drives the dark-mode tokens
	await expect(page.locator('html')).toHaveClass(/terminal/);
	await expect(page.locator('html')).toHaveClass(/dark/);

	await chooseFromDropdown(page, 'Theme', 'Classic Light');

	await expect(page.locator('html')).toHaveClass(/solid-light/);
	await expect(page.locator('html')).not.toHaveClass(/terminal/);
});

test('marks the theme that is currently active', async ({ page }) => {
	await chooseFromDropdown(page, 'Theme', 'Terminal');
	await page.getByRole('button', { name: 'Theme' }).hover();

	await expect(page.getByRole('button', { name: 'Terminal' })).toHaveClass(/font-bold/);
});

test.describe('with an operating system that prefers dark', () => {
	test.use({ colorScheme: 'dark' });

	test('starts on the dark default', async ({ page }) => {
		await expect(page.locator('html')).toHaveClass(/dark/);
	});
});

test('remembers the theme in a cookie, so the server renders it right away', async ({ page }) => {
	await chooseFromDropdown(page, 'Theme', 'Terminal');

	const cookie = (await page.context().cookies()).find((item) => item.name === 'theme');

	expect(cookie?.value).toBe('terminal');

	// A full load, so the class can only come from the server.
	await page.goto('/');

	await expect(page.locator('html')).toHaveClass(/terminal/);
});

test('mints a scenery seed on the first visit and rerolls it on demand', async ({ page }) => {
	const seed = async () =>
		(await page.context().cookies()).find((item) => item.name === 'scenerySeed')?.value;

	const minted = await seed();

	expect(minted).toMatch(/^\d+$/);

	await chooseFromDropdown(page, 'Theme', 'Reroll scenery');

	await expect.poll(seed).not.toBe(minted);
});

test('pauses and resumes the scenery animations', async ({ page }) => {
	await chooseFromDropdown(page, 'Theme', 'Pause animations');

	await expect(page.locator('html')).toHaveClass(/scenery-paused/);

	await chooseFromDropdown(page, 'Theme', 'Resume animations');

	await expect(page.locator('html')).not.toHaveClass(/scenery-paused/);
});
