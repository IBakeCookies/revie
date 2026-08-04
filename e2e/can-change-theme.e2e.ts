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

	await page
		.getByRole('button', {
			name: 'Theme',
		})
		.hover();

	await expect(
		page.getByRole('button', {
			name: 'Terminal',
		}),
	).toHaveClass(/font-bold/);
});

test.describe('with an operating system that prefers dark', () => {
	test.use({
		colorScheme: 'dark',
	});

	test('starts on the dark default', async ({ page }) => {
		await expect(page.locator('html')).toHaveClass(/dark/);
		// the pre-paint script swaps the classes it owns rather than assigning
		// className, so the light default's has to be gone
		await expect(page.locator('html')).not.toHaveClass(/fallow/);
	});
});

test.describe('with an operating system that asks for reduced motion', () => {
	// emulateMedia, not test.use({ reducedMotion }): the context option does not
	// reach matchMedia in this Chromium, so the page would see no preference.
	test.beforeEach(async ({ page }) => {
		await page.emulateMedia({
			reducedMotion: 'reduce',
		});

		await page.goto('/');
	});

	test('pauses the scenery before first paint, with no cookie', async ({ page }) => {
		await expect(page.locator('html')).toHaveClass(/scenery-paused/);
	});

	/* style/scenery/index.css pauses motion under prefers-reduced-motion with
	   !important, so the toggle could not honor a resume — it is hidden rather than
	   left to mislabel a state it cannot change. The reroll is unaffected: a static
	   arrangement still varies per user. */
	test('hides the motion toggle and keeps the reroll', async ({ page }) => {
		await page
			.getByRole('button', {
				name: 'Theme',
			})
			.hover();

		await expect(
			page.getByRole('button', {
				name: 'Reroll scenery',
			}),
		).toBeVisible();

		await expect(
			page.getByRole('button', {
				name: /animations/,
			}),
		).toHaveCount(0);
	});

	// Both preferences at once is what the pre-paint script used to break: it
	// assigned className, wiping the scenery-paused class the server had stamped.
	test('keeps the paused scenery when it also swaps in the dark default', async ({ page }) => {
		await page.emulateMedia({
			colorScheme: 'dark',
			reducedMotion: 'reduce',
		});

		await page.goto('/');

		await expect(page.locator('html')).toHaveClass(/dark/);
		await expect(page.locator('html')).toHaveClass(/scenery-paused/);
		await expect(page.locator('html')).not.toHaveClass(/fallow/);
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
