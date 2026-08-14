import { expect, test } from '@playwright/test';
import { ADMIN_TOKEN, signIn } from './admin';

// Nothing here submits a config that would be ACCEPTED: the whole suite shares one
// preview server pointed at the tracked e2e/fixture-config.json, so a successful write
// would dirty the working tree and, through the stamp cache, every test after it. The
// success path is covered by config-source.spec.ts against a mocked fs.
test('refuses a config that would drop a container, and leaves the file alone', async ({
	page,
}) => {
	await signIn(page, ADMIN_TOKEN);

	const editor = page.getByRole('textbox', {
		name: 'Current configuration',
	});

	const onDisk = await editor.inputValue();

	// The editor shows the file, not the normalized config: `defaults` is consumed
	// during normalization, so it only survives if the raw text is what was loaded.
	expect(onDisk).toContain('"defaults"');

	const rejected = JSON.stringify(
		{
			pages: {
				'/': {
					containers: [
						{
							name: 'BoxService',
							props: {
								title: 'No href',
							},
						},
					],
				},
			},
		},
		null,
		2,
	);

	await editor.fill(rejected);

	await page
		.getByRole('button', {
			name: 'Save configuration',
		})
		.click();

	// The framing is translated; the diagnostic line under it is normalizeConfig's own
	// sentence, rendered verbatim because the operator is its only audience.
	const alert = page.getByRole('alert');

	await expect(alert).toContainText('Nothing was written');
	await expect(alert).toContainText('Skipping container "BoxService"');

	// The refused edit stays in the editor rather than being thrown away.
	await expect(editor).toHaveValue(rejected);

	await page.goto('/admin');

	await expect(editor).toHaveValue(onDisk);
});
