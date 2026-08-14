import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

// The same literal playwright.config.ts hands the preview server: `webServer.env`
// reaches that process, not this one, so there is nothing to import it from.
const TOKEN = 'e2e-operator-token';

async function signIn(page: Page, token: string) {
	await page.goto('/admin/login');
	await page.getByLabel('Operator token').fill(token);

	await page
		.getByRole('button', {
			name: 'Sign in',
		})
		.click();
}

test('sends a signed-out visitor to the login form', async ({ page }) => {
	await page.goto('/admin');

	await expect(page).toHaveURL('/admin/login');

	await expect(page.getByLabel('Operator token')).toBeVisible();
});

test('rejects a wrong token and does not echo it back', async ({ page }) => {
	await signIn(page, 'not-the-token');

	await expect(page.getByRole('alert')).toHaveText('That token was not accepted');

	await expect(page.getByLabel('Operator token')).toHaveValue('');
});

test('signs in with the right token, and signing out gives the page back up', async ({ page }) => {
	await signIn(page, TOKEN);

	await expect(page).toHaveURL('/admin');

	// The read-only config view is the thing the guard is protecting.
	await expect(
		page.getByRole('heading', {
			name: 'Current configuration',
		}),
	).toBeVisible();

	await page
		.getByRole('button', {
			name: 'Sign out',
		})
		.click();

	await expect(page).toHaveURL('/admin/login');

	await page.goto('/admin');

	await expect(page).toHaveURL('/admin/login');
});
