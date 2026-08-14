import type { Page } from '@playwright/test';

// The same literal playwright.config.ts hands the preview server: `webServer.env`
// reaches that process, not this one, so there is nothing to import it from.
export const ADMIN_TOKEN = 'e2e-operator-token';

/** Every admin feature is behind the guard, so each of its specs starts here. */
export async function signIn(page: Page, token: string) {
	await page.goto('/admin/login');
	await page.getByLabel('Operator token').fill(token);

	await page
		.getByRole('button', {
			name: 'Sign in',
		})
		.click();
}
