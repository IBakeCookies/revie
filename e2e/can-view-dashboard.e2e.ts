import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('shows the dashboard title', async ({ page }) => {
	await expect(
		page.getByRole('heading', {
			level: 1,
		}),
	).toHaveText('Revie Dashboard');
});

test('renders the containers of the configured page at any nesting depth', async ({ page }) => {
	await expect(
		page.getByRole('heading', {
			name: 'Services',
		}),
	).toBeVisible();

	await expect(page.getByText('Reachable')).toBeVisible();

	await expect(
		page.getByRole('link', {
			name: /Loopback/,
		}),
	).toBeVisible();

	await expect(
		page.getByRole('link', {
			name: /Nowhere/,
		}),
	).toBeVisible();
});

test('opens a service in a new tab without leaking the dashboard as referrer', async ({ page }) => {
	const link = page.getByRole('link', {
		name: /Loopback/,
	});

	await expect(link).toHaveAttribute('href', 'http://127.0.0.1:4173');
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', 'noreferrer');
});

test('shows a clock that keeps running', async ({ page }) => {
	const clock = page.getByText(/\d{1,2}:\d{2}:\d{2}/).first();

	await expect(clock).toBeVisible();

	const first = await clock.textContent();

	await expect(clock).not.toHaveText(first ?? '');
});
