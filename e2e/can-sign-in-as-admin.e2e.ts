import { expect, test } from '@playwright/test';
import { ADMIN_TOKEN, signIn } from './admin';

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
	await signIn(page, ADMIN_TOKEN);

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
