import { expect, test } from '@playwright/test';
import { chooseFromDropdown } from './dropdown';

const ADGUARD_HREF = 'http://127.0.0.1:9999';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('links to the configured instance', async ({ page }) => {
	const box = page.locator(`a[href="${ADGUARD_HREF}"]`);

	await expect(box).toBeVisible();
	await expect(box).toHaveAttribute('rel', 'noreferrer');

	// The config names a variable, never a credential — so nothing about the secret may
	// reach the page. `box-stats.svelte` declares no `{...restProps}`, which is the only
	// thing keeping config's own props off this anchor; these two lines are what would
	// catch one being added back.
	await expect(box).not.toHaveAttribute('secret');
	await expect(box).not.toHaveAttribute('provider');
});

test('says the stats are unavailable instead of failing the page when the service is unreachable', async ({
	page,
}) => {
	const box = page.locator(`a[href="${ADGUARD_HREF}"]`);

	await expect(box.locator('p')).toHaveCount(1);

	// The PRODUCT name, not the config's token: `providerNameLabel` is what turns
	// `"provider": "adguard"` into something a person reads.
	await expect(box.locator('p')).toHaveText('AdGuard Home statistics unavailable');

	// The rest of the page is unaffected.
	await expect(
		page.getByRole('heading', {
			name: 'Services',
		}),
	).toBeVisible();
});

// The whole reporting chain, which nothing below e2e sees end to end: the load hands
// back the provider and the href, the route turns them into copy, and the live region
// renders it. Before this, the reason was written to the server's stdout only — the box
// said "unavailable" and never said why.
test('says WHY the stats box is empty, and which one', async ({ page }) => {
	const toast = page.getByRole('status');

	// The href is in the sentence because the failure is keyed per INSTANCE: a page of two
	// stats boxes gets one line each, naming the box the reader is looking at.
	await expect(toast).toContainText(`Could not read AdGuard Home statistics from ${ADGUARD_HREF}`);

	await toast
		.getByRole('button', {
			name: 'Dismiss this message',
		})
		.click();

	await expect(toast).not.toContainText('Could not read AdGuard Home statistics');
});

// The reason the load returns data rather than `AppError.message`. That message is
// minted in `data` ("fetch failed") and there is no locale down there — so a toast
// built from it would be English on a German page, forever and with nothing to fix it
// short of this change. Deleting `m.stats_load_failed()` in favour of the error's own
// text fails here and nowhere else.
test('raises that toast in the page language, not the error language', async ({ page }) => {
	await chooseFromDropdown(page, 'Language', 'German');
	await page.goto('/');

	const toast = page.getByRole('status');

	await expect(toast).toContainText(
		`Statistiken von AdGuard Home unter ${ADGUARD_HREF} konnten nicht gelesen werden`,
	);

	await expect(toast).not.toContainText('fetch failed');
});
