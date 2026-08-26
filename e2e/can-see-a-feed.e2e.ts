import { expect, test } from '@playwright/test';

// The fixture's feed lives on the same deliberately closed port as its AdGuard box:
// the suite must not depend on a service of the machine it runs on, so what this file
// can exercise end to end is the FAILURE half — the read failing, the reason crossing
// as data, and the route picking the words. The success path is fenced by
// box-feed-wrapper.stories.svelte against a populated store, which is where e2e cannot
// reach anyway.
const FEED_HREF = 'http://127.0.0.1:9999/feed.xml';

test.beforeEach(async ({ page }) => {
	await page.goto('/news');
});

test('is reachable from the navigation under its configured name', async ({ page }) => {
	await expect(
		page
			.getByRole('navigation')
			.getByRole('link', {
				name: 'News',
			})
			.first(),
	).toBeVisible();
});

test('says the feed is unavailable instead of failing the page', async ({ page }) => {
	// One paragraph in the box, no list of rows: an empty rectangle would read as a
	// layout bug rather than as a source that did not answer. By ROLE, not `main ul`:
	// the quick-jump's closed <dialog> also sits in main and keeps its own <ul> in the
	// DOM, so a CSS count matches a list no reader can see.
	await expect(page.getByText('The feed is unavailable')).toBeVisible();
	await expect(page.locator('main').getByRole('list')).toHaveCount(0);

	// The rest of the page is unaffected.
	await expect(
		page.getByRole('heading', {
			name: 'Revie Dashboard',
		}),
	).toBeVisible();
});

// The whole reporting chain, which nothing below e2e sees end to end for feeds: the
// load hands back the bare href, the route turns it into copy, and the live region
// renders it.
test('says WHY the feed box is empty, and which one', async ({ page }) => {
	const toast = page.getByRole('status');

	// The href is in the sentence because failures are keyed per source: a page holding
	// two feeds gets one line each, naming the one the reader is looking at.
	await expect(toast).toContainText(`Could not read the feed from ${FEED_HREF}`);

	await toast
		.getByRole('button', {
			name: 'Dismiss this message',
		})
		.click();

	await expect(toast).not.toContainText('Could not read the feed');
});
