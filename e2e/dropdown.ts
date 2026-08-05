import type { Page } from '@playwright/test';

/**
 * The dropdowns open on hover or on trigger focus, so the panel has to be revealed
 * before clicking. This helper takes the pointer path; the keyboard one is asserted
 * directly in can-change-theme.e2e.ts.
 */
export async function chooseFromDropdown(page: Page, trigger: string, option: string) {
	await page
		.getByRole('button', {
			name: trigger,
		})
		.hover();

	await page
		.getByRole('button', {
			name: option,
		})
		.click();
}
