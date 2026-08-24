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
	// nothing here knows which containers nest. The button names the list it appends to,
	// built from the page path plus this Grid's slot in it: it is untitled, so the type
	// and the slot carry the identity.
	await containers.last().getByLabel('Container type').selectOption('Grid');

	await containers
		.last()
		.getByRole('button', {
			name: 'Add container to /media/plex · Grid 2, position 1',
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

test('moves a container within its list, including a nested one', async ({ page }) => {
	await signIn(page, ADMIN_TOKEN);

	const editor = page.locator('form[action="?/save"]');
	const payload = editor.locator('input[name="config"]');
	const containers = editor.getByRole('group');

	async function containersOf(path: string): Promise<string[]> {
		const config = JSON.parse(await payload.inputValue());

		return config.pages[path].containers.map((container: { name: string }) => container.name);
	}

	// Two entries so there is something to swap: an append, then a retype.
	await editor
		.getByRole('button', {
			name: 'Add container to /media/plex, position 2',
		})
		.click();

	await containers.last().getByLabel('Container type').selectOption('BoxDate');

	expect(await containersOf('/media/plex')).toEqual(['BoxService', 'BoxDate']);

	// The accessible name carries the list and the slot, which is also what makes
	// these buttons findable here without scoping to the page's subtree.
	await editor
		.getByRole('button', {
			name: 'Move container up in /media/plex, position 2',
		})
		.click();

	expect(await containersOf('/media/plex')).toEqual(['BoxDate', 'BoxService']);

	// At the edges the move does not exist, and the button says so rather than hiding —
	// a hidden control shifts under the pointer between clicks.
	await expect(
		editor.getByRole('button', {
			name: 'Move container up in /media/plex, position 1',
		}),
	).toBeDisabled();

	await expect(
		editor.getByRole('button', {
			name: 'Move container down in /media/plex, position 2',
		}),
	).toBeDisabled();

	// Nesting is no different: the Grid's second child moves above its first sibling.
	const grid = editor.getByRole('group', {
		name: 'Grid',
		exact: true,
	});

	await grid
		.getByRole('button', {
			name: 'Move container up in Grid, position 2',
		})
		.click();

	const config = JSON.parse(await payload.inputValue());

	const items = config.pages['/'].containers.find(
		(container: { name: string }) => container.name === 'Grid',
	).props.items;

	expect(items.map((child: { name: string }) => child.name)).toEqual(['BoxService', 'SubGrid']);
});

test("drops a switched container's undeclared props and keeps the shared ones", async ({
	page,
}) => {
	await signIn(page, ADMIN_TOKEN);

	const editor = page.locator('form[action="?/save"]');
	const payload = editor.locator('input[name="config"]');

	async function firstContainerOf(path: string): Promise<{ name: string; props?: object }> {
		const config = JSON.parse(await payload.inputValue());

		return config.pages[path].containers[0];
	}

	const servicesPage = editor.locator('div', {
		has: page.getByRole('heading', {
			level: 4,
			name: '/services',
			exact: true,
		}),
	});

	// Leftovers would be worse than untidy: normalizeConfig warns about every prop the
	// new type does not declare, and refuse-on-warnings turns that warning into a save
	// nothing can lift from the form — so the form itself has to do the dropping.
	await servicesPage
		.getByRole('group')
		.first()
		.getByLabel('Container type')
		.selectOption('BoxDate');

	expect(await firstContainerOf('/services')).toEqual({
		name: 'BoxDate',
		props: {},
	});

	// Keys both schemas declare survive: `items` carries its children across a
	// Grid → SubGrid switch, and everything goes when neither type wants it.
	// Located by the generated id rather than by the group's name, because the
	// retyping below CHANGES that name (`Grid`, then `SubGrid`) — a name-based
	// locator would resolve to nothing on the second switch.
	const gridType = editor.locator('#admin-0-2-name');

	await gridType.selectOption('SubGrid');

	let switched = JSON.parse(await payload.inputValue()).pages['/'].containers.find(
		(container: { name: string }) => container.name === 'SubGrid',
	);

	expect(switched.props.title).toBe('Services');
	expect(switched.props.items).toHaveLength(2);

	await gridType.selectOption('BoxDate');

	// By position, not by name: the fixture already carries a BoxDate on this page,
	// so a name lookup would find that one rather than the container just retyped.
	switched = JSON.parse(await payload.inputValue()).pages['/'].containers[2];

	expect(switched.name).toBe('BoxDate');
	expect(switched.props).toEqual({});
});

test('adds, renames, names and removes a page', async ({ page }) => {
	await signIn(page, ADMIN_TOKEN);

	const editor = page.locator('form[action="?/save"]');
	const payload = editor.locator('input[name="config"]');

	async function paths(): Promise<string[]> {
		return Object.keys(JSON.parse(await payload.inputValue()).pages);
	}

	expect(await paths()).toEqual(['/', '/services', '/news', '/media/plex']);

	await editor
		.getByRole('button', {
			name: 'Add page',
		})
		.click();

	// A unique key, so two adds cannot collide into one page.
	expect(await paths()).toEqual(['/', '/services', '/news', '/media/plex', '/new-page']);

	const pathInput = editor.getByLabel('Page path').last();
	const nameInput = editor.getByLabel('Navigation name').last();

	// A key without the leading slash would be dropped outright when the config is
	// read — refuse-on-warnings makes that drop block every save — so the form fixes
	// it instead of writing a file it could never read back.
	await pathInput.fill('blog');
	await pathInput.blur();

	expect(await paths()).toEqual(['/', '/services', '/news', '/media/plex', '/blog']);
	await expect(pathInput).toHaveValue('/blog');

	// Renaming into an existing key would merge two pages; refused, and the input
	// shows the key that is still in force rather than silently disagreeing.
	await pathInput.fill('/services');
	await pathInput.blur();

	expect(await paths()).toEqual(['/', '/services', '/news', '/media/plex', '/blog']);
	await expect(pathInput).toHaveValue('/blog');

	// The nav label, optional: absent means the nav falls back to the path.
	await nameInput.fill('Blog');

	let config = JSON.parse(await payload.inputValue());

	expect(config.pages['/blog'].name).toBe('Blog');

	await editor
		.getByRole('button', {
			name: 'Remove this page',
		})
		.last()
		.click();

	expect(await paths()).toEqual(['/', '/services', '/news', '/media/plex']);

	config = JSON.parse(await payload.inputValue());

	// Removal takes the whole entry; nothing half-remains.
	expect(config.pages['/blog']).toBeUndefined();
});

// The fence for the #35 wart: two sibling containers of ONE type used to offer the same
// insertion button name twice, because position counts within each list and both lists
// start at 1. Never saved — like every test in this file, nothing is submitted.
test('tells two same-type lists apart in the insertion buttons', async ({ page }) => {
	await signIn(page, ADMIN_TOKEN);

	const editor = page.locator('form[action="?/save"]');

	// Two untitled Grids on one page. The retyped container is found through its
	// generated id rather than a group's name, which same-type siblings share by
	// construction — `/services` is the second page key, so its ids are `admin-1-*`.
	const added: [number, string][] = [
		[2, 'admin-1-1'],
		[3, 'admin-1-2'],
	];

	for (const [position, id] of added) {
		await editor
			.getByRole('button', {
				name: `Add container to /services, position ${position}`,
			})
			.click();

		await editor.locator(`#${id}-name`).selectOption('Grid');
	}

	// Untitled, the type plus the slot each occupies in the page's list carries the
	// difference — and neither name is the old colliding one.
	await expect(
		editor.getByRole('button', {
			name: 'Add container to /services · Grid 2, position 1',
		}),
	).toHaveCount(1);

	await expect(
		editor.getByRole('button', {
			name: 'Add container to /services · Grid 3, position 1',
		}),
	).toHaveCount(1);

	await expect(
		editor.getByRole('button', {
			name: 'Add container to Grid, position 1',
		}),
	).toHaveCount(0);

	// Titled, the operator's own label takes over as the identifier.
	await editor.locator('#admin-1-1-title').fill('Media');

	await expect(
		editor.getByRole('button', {
			name: 'Add container to /services · Media, position 1',
		}),
	).toHaveCount(1);
});
