import { expect, test } from '@playwright/test';
import { chooseFromDropdown } from './dropdown';

const ADGUARD_HREF = 'http://127.0.0.1:9999';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('links to the configured AdGuard instance', async ({ page }) => {
	const box = page.locator(`a[href="${ADGUARD_HREF}"]`);

	await expect(box).toBeVisible();
	await expect(box).toHaveAttribute('rel', 'noreferrer');
});

test('says the stats are unavailable instead of failing the page when AdGuard is unreachable', async ({
	page,
}) => {
	const box = page.locator(`a[href="${ADGUARD_HREF}"]`);

	await expect(box.locator('p')).toHaveCount(1);
	await expect(box.locator('p')).toHaveText('AdGuard statistics unavailable');

	// The rest of the page is unaffected.
	await expect(
		page.getByRole('heading', {
			name: 'Services',
		}),
	).toBeVisible();
});

// The whole reporting chain, which nothing below e2e sees end to end: the load hands
// back a flag, the route turns it into copy, and the live region renders it. Before
// this, the reason was written to the server's stdout only — the box said "unavailable"
// and never said why.
test('says WHY the AdGuard box is empty, not just that it is', async ({ page }) => {
	const toast = page.getByRole('status');

	await expect(toast).toContainText('Could not read AdGuard statistics');

	await toast
		.getByRole('button', {
			name: 'Dismiss this message',
		})
		.click();

	await expect(toast).not.toContainText('Could not read AdGuard statistics');
});

// The reason the load returns a flag rather than `AppError.message`. That message is
// minted in `data` ("fetch failed") and there is no locale down there — so a toast
// built from it would be English on a German page, forever and with nothing to fix it
// short of this change. Deleting `m.adguard_load_failed()` in favour of the error's own
// text fails here and nowhere else.
test('raises that toast in the page language, not the error language', async ({ page }) => {
	await chooseFromDropdown(page, 'Language', 'German');
	await page.goto('/');

	const toast = page.getByRole('status');

	await expect(toast).toContainText('AdGuard-Statistiken konnten nicht gelesen werden');
	await expect(toast).not.toContainText('fetch failed');
});
