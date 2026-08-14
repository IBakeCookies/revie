import { expect, test } from '@playwright/test';

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
