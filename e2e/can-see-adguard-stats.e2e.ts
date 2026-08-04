import { expect, test } from '@playwright/test';

const ADGUARD_HREF = 'http://127.0.0.1:9999';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('links to the configured AdGuard instance', async ({ page }) => {
	const box = page.locator(`a[href="${ADGUARD_HREF}"]`);

	await expect(box).toBeVisible();
	await expect(box).toHaveAttribute('rel', 'noreferrer');
});

test('renders an empty box instead of failing the page when AdGuard is unreachable', async ({
	page,
}) => {
	const box = page.locator(`a[href="${ADGUARD_HREF}"]`);

	await expect(box.locator('p')).toHaveCount(0);

	// The rest of the page is unaffected.
	await expect(
		page.getByRole('heading', {
			name: 'Services',
		}),
	).toBeVisible();
});
