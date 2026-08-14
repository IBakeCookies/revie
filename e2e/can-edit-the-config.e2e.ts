import { expect, test } from '@playwright/test';
import { ADMIN_TOKEN, signIn } from './admin';

// Nothing here submits a config that would be ACCEPTED: the whole suite shares one
// preview server pointed at the tracked e2e/fixture-config.json, so a successful write
// would dirty the working tree and, through the stamp cache, every test after it. The
// success path is covered by config-source.spec.ts against a mocked fs.
test('generates the container form from the schema, and refuses a container with no href', async ({
	page,
}) => {
	await signIn(page, ADMIN_TOKEN);

	const editor = page.locator('form[action="?/save"]');
	const containers = editor.getByRole('group');
	const onDisk = await containers.count();

	// The fields come from the schema, not from a hand-written form: `img.src` is a nested
	// path nothing on this page spells, and the values are the file's own.
	await expect(editor.getByLabel('img.src').first()).toHaveValue('/robots.txt');

	await expect(
		editor
			.getByLabel('href', {
				exact: true,
			})
			.first(),
	).toHaveValue('http://127.0.0.1:9999');

	// The payload is the whole parsed file, so `defaults` — which normalization eats and
	// no field on this page shows — survives the round trip through the form.
	await expect(editor.locator('input[name="config"]')).toHaveValue(/"defaults"/);

	// The last page in the fixture, which holds one container — so this appends, and every
	// insertion point names the list it belongs to.
	await editor
		.getByRole('button', {
			name: 'Add container to /media/plex, position 2',
		})
		.click();

	// Picking a Grid grows the form a children list, because `items` is described as one —
	// nothing here knows which containers nest.
	await containers.last().getByLabel('Container type').selectOption('Grid');

	await containers
		.last()
		.getByRole('button', {
			name: 'Add container to Grid, position 1',
		})
		.click();

	const child = containers.last();

	await child.getByLabel('Container type').selectOption('BoxService');

	await child
		.getByLabel('title', {
			exact: true,
		})
		.fill('No href');

	await editor
		.getByRole('button', {
			name: 'Save configuration',
		})
		.click();

	// The framing is translated; the diagnostic line under it is normalizeConfig's own
	// sentence, rendered verbatim because the operator is its only audience.
	const alert = page.getByRole('alert');

	await expect(alert).toContainText('Nothing was written');
	await expect(alert).toContainText('Skipping container "BoxService"');

	// The refused edit stays in the form rather than being thrown away: the rejection
	// carries the submitted text back, and the form is rebuilt from it — nesting and all.
	await expect(containers).toHaveCount(onDisk + 2);

	await expect(
		containers.last().getByLabel('title', {
			exact: true,
		}),
	).toHaveValue('No href');

	await page.goto('/admin');

	// Nothing was written, so the file is what it was.
	await expect(containers).toHaveCount(onDisk);
});

// Never saved, so this one cannot write at all: it reads the payload the form has built,
// which is the thing that would regress silently.
test('inserts a container before an existing one, not only after the last', async ({ page }) => {
	await signIn(page, ADMIN_TOKEN);

	const editor = page.locator('form[action="?/save"]');
	const payload = editor.locator('input[name="config"]');

	async function containersOf(path: string): Promise<string[]> {
		const config = JSON.parse(await payload.inputValue());

		return config.pages[path].containers.map((container: { name: string }) => container.name);
	}

	expect(await containersOf('/services')).toEqual(['BoxService']);

	// Position 1 of a list that already has one entry: the insertion point before it.
	await editor
		.getByRole('button', {
			name: 'Add container to /services, position 1',
		})
		.click();

	// The block for that page, found through its heading, so the new container is the first
	// group in ITS list rather than the first on the form.
	const servicesPage = editor.locator('div', {
		has: page.getByRole('heading', {
			level: 4,
			name: '/services',
			exact: true,
		}),
	});

	await servicesPage
		.getByRole('group')
		.first()
		.getByLabel('Container type')
		.selectOption('BoxDate');

	// Ahead of the container that was there, and the rest of the file is untouched.
	expect(await containersOf('/services')).toEqual(['BoxDate', 'BoxService']);
	expect(await containersOf('/media/plex')).toEqual(['BoxService']);
});
