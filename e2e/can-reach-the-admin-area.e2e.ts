import { expect, test } from '@playwright/test';
import { ADMIN_TOKEN, signIn } from './admin';

// The preview server runs with DASHBOARD_ADMIN_TOKEN set, so the link is expected
// to be there. The off case — no token, no link — is a node spec over the layout
// load (src/routes/layout.server.spec.ts): one server serves the whole suite.
test('offers the admin area in the header, and following it reaches the login form', async ({
	page,
}) => {
	await page.goto('/');

	const link = page.getByRole('link', {
		name: 'Administration',
	});

	await expect(link).toBeVisible();

	await link.click();

	await expect(page).toHaveURL('/admin/login');

	await expect(page.getByLabel('Operator token')).toBeVisible();
});

// The other entry point, and the one that carries a destination: the pen names the page
// it is sitting on, so the editor opens at that page's block instead of at the top of a
// form listing every one of them.
test('offers a pen into the editor for the page being looked at', async ({ page }) => {
	await signIn(page, ADMIN_TOKEN);

	// The deepest fixture key, so a grouped path is what the fragment has to carry.
	await page.goto('/media/plex');

	await page
		.getByRole('link', {
			name: 'Edit Plex',
		})
		.click();

	await expect(page).toHaveURL('/admin#/media/plex');

	// The whole point of the fragment. Kit resolves it with getElementById, so the id is
	// the config key verbatim — slashes and all — and scrolls the heading into view.
	await expect(
		page.getByRole('heading', {
			level: 4,
			name: '/media/plex',
			exact: true,
		}),
	).toBeInViewport();

	// The configured 404 is not a config page, so there is no key for a pen to name and
	// no block for one to land on.
	await page.goto('/nope');

	await expect(
		page.getByRole('link', {
			name: /^Edit /,
		}),
	).toHaveCount(0);

	// /admin itself is the second URL with no key behind it: the guard takes the path
	// back, so it is never a pages entry. Same {#if configPage} branch as the 404,
	// asserted separately because it is the one other path the header renders on.
	await page.goto('/admin');

	await expect(
		page.getByRole('link', {
			name: /^Edit /,
		}),
	).toHaveCount(0);
});

// No "is signed in" flag gates the pen — the same decision the Administration link
// records: signed out it renders all the same, and following it is how an operator
// gets from the page they were on to the login form. handleAdmin owns the /admin
// half of the href and answers it with its 303.
test('offers the pen signed out, and following it reaches the login form', async ({ page }) => {
	await page.goto('/services');

	const pen = page.getByRole('link', {
		name: 'Edit Services',
	});

	await expect(pen).toBeVisible();

	await pen.click();

	await expect(page).toHaveURL('/admin/login');

	await expect(page.getByLabel('Operator token')).toBeVisible();
});

// The signed-out CLICK loses the destination — kit follows handleAdmin's 303
// client-side and nothing re-attaches the fragment — but a direct hit keeps it
// through signing in with no code on either side: the browser re-attaches the
// fragment to every redirect that lacks one, the 303 to the login form and then the
// action's 303 back to /admin, so kit resolves it after authentication all the same.
// Bookmarks and shared links take this path, which is why it is the one fenced here.
test('keeps a deep-linked destination through signing in', async ({ page }) => {
	await page.goto('/admin#/media/plex');

	await expect(page.getByLabel('Operator token')).toBeVisible();

	await page.getByLabel('Operator token').fill(ADMIN_TOKEN);

	await page
		.getByRole('button', {
			name: 'Sign in',
		})
		.click();

	await expect(page).toHaveURL('/admin#/media/plex');

	await expect(
		page.getByRole('heading', {
			level: 4,
			name: '/media/plex',
			exact: true,
		}),
	).toBeInViewport();
});
