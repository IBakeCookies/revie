import type { Page } from '@playwright/test';

/** The dropdowns open on hover only, so the panel has to be revealed before clicking. */
export async function chooseFromDropdown(page: Page, trigger: string, option: string) {
	await page.getByRole('button', { name: trigger }).hover();
	await page.getByRole('button', { name: option }).click();
}
