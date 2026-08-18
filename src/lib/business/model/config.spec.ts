import type { ConfigContainer, ContainerField } from '$lib/business/model/config';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	collectServiceProbes,
	collectStatsTargets,
	containerFields,
	containerNames,
	isGrid,
	normalizeConfig,
	providerNames,
	statsKey,
} from '$lib/business/model/config';

const rawConfig = {
	defaults: {
		BoxService: {
			span: 6,
		},
	},
	pages: {
		'/': {
			name: 'Home',
			containers: [
				{
					name: 'Grid',
					props: {
						title: 'Services',
						span: 99,
						class: 'legacy-class-from-an-older-config',
						items: [
							{
								name: 'SubGrid',
								props: {
									items: [
										{
											name: 'BoxStats',
											props: {
												provider: 'adguard',
												href: 'http://adguard.local',
												secret: 'ADGUARD_MAIN',
											},
										},
										{
											name: 'BoxService',
											props: {
												title: 'Proxmox',
												href: 'https://proxmox.local:8006',
												img: {
													src: 'https://icons.local/proxmox.svg',
												},
											},
										},
									],
								},
							},
							{
								name: 'NotAComponent',
							},
							'not a container',
						],
					},
				},
			],
		},
		'/broken': 'not a page',
		'/media/plex': {
			name: 'Plex',
			containers: [],
		},
	},
};

const { config } = normalizeConfig(rawConfig);
const home = config.pages['/'];
const grid = home.containers[0];

function itemsOf(container: ConfigContainer): ConfigContainer[] {
	return isGrid(container) ? container.props.items : [];
}

function pageWith(...containers: unknown[]) {
	const { config, warnings } = normalizeConfig({
		pages: {
			'/': {
				containers,
			},
		},
	});

	return {
		page: config.pages['/'],
		warnings,
	};
}

describe('normalizeConfig', () => {
	it('keeps only well-formed pages and containers', () => {
		expect(Object.keys(config.pages)).toEqual(['/', '/media/plex']);
		expect(home.name).toBe('Home');
		expect(home.containers).toHaveLength(1);
	});

	it('keeps a nested page path, which the route matches as a rest parameter', () => {
		expect(config.pages['/media/plex'].name).toBe('Plex');
	});

	it('drops a page path with no leading slash, which would emit a relative link', () => {
		const { config: dropped, warnings } = normalizeConfig({
			pages: {
				noslash: {
					containers: [],
				},
			},
		});

		expect(Object.keys(dropped.pages)).toEqual([]);
		expect(warnings).toEqual([expect.stringContaining('noslash')]);
	});

	it('drops unregistered components and entries that are not containers', () => {
		expect(grid.name).toBe('Grid');
		expect(itemsOf(grid).map((item) => item.name)).toEqual(['SubGrid']);
	});

	it('clamps span to the number of grid columns', () => {
		expect(grid.props.span).toBe(12);
	});

	it('clamps span up to a single column', () => {
		const { page } = pageWith({
			name: 'BoxDate',
			props: {
				span: 0,
			},
		});

		expect(page.containers[0].props.span).toBe(1);
	});

	it('warns about a span that is not a whole number, which would render full width', () => {
		const { page, warnings } = pageWith({
			name: 'BoxDate',
			props: {
				span: '6',
			},
		});

		expect(page.containers[0].props.span).toBeUndefined();
		expect(warnings).toEqual([expect.stringContaining('span')]);
	});

	it('strips class names, which could never reach the Tailwind build', () => {
		// Cast because the schema deliberately has no `class` — this asserts the
		// runtime object does not carry one either.
		expect((grid.props as Record<string, unknown>).class).toBeUndefined();
	});

	it('strips gridClass as well as class', () => {
		const { page, warnings } = pageWith({
			name: 'Grid',
			props: {
				gridClass: 'grid-cols-3',
			},
		});

		expect((page.containers[0].props as Record<string, unknown>).gridClass).toBeUndefined();
		expect(warnings).toEqual([expect.stringContaining('gridClass')]);
	});

	it('drops a prop the schema does not declare, which would reach a real DOM node', () => {
		// The sentence is the operator's only account of it, so it is asserted whole:
		// `title` is a global HTML attribute, and a misspelled optional prop (`spann`)
		// used to render wrong with nothing said either way.
		const { page, warnings } = pageWith({
			name: 'BoxDate',
			props: {
				spann: 6,
				title: 'a tooltip nobody asked for',
			},
		});

		expect(page.containers[0].props).toEqual({});

		expect(warnings).toEqual([
			'Ignoring "spann" on container "BoxDate", no such prop exists',
			'Ignoring "title" on container "BoxDate", no such prop exists',
		]);
	});

	it('applies per-component defaults at any nesting depth', () => {
		const nested = itemsOf(itemsOf(grid)[0]);

		expect(nested.map((item) => item.name)).toEqual(['BoxStats', 'BoxService']);
		expect(nested[1].props.span).toBe(6);
	});

	it('strips items from a defaults entry, leaving a container its own children', () => {
		const { config, warnings } = normalizeConfig({
			defaults: {
				Grid: {
					items: [
						{
							name: 'Grid',
						},
					],
				},
			},
			pages: {
				'/': {
					containers: [
						{
							name: 'Grid',
							props: {
								items: [
									{
										name: 'BoxDate',
									},
								],
							},
						},
					],
				},
			},
		});

		expect(itemsOf(config.pages['/'].containers[0]).map((item) => item.name)).toEqual(['BoxDate']);
		expect(warnings).toEqual([expect.stringContaining('items')]);
	});

	// Each inherited Grid has no own `items`, so it inherits the entry again: unstripped,
	// this recurses until the stack goes and every request 500s.
	it('warns once per defaults entry however many containers inherit it', () => {
		const { warnings } = normalizeConfig({
			defaults: {
				Grid: {
					items: [
						{
							name: 'Grid',
						},
					],
				},
			},
			pages: {
				'/': {
					containers: [
						{
							name: 'Grid',
						},
						{
							name: 'Grid',
						},
					],
				},
			},
		});

		expect(warnings).toEqual([expect.stringContaining('items')]);
	});

	// Nothing looks a defaults key up unless the schema names it, so a typo is not a merge
	// that fails — it is a merge that never happens.
	it('warns about a defaults entry that names no container, and one that is not props', () => {
		const { warnings } = normalizeConfig({
			defaults: {
				BoxServices: {
					span: 4,
				},
				BoxService: 'x',
			},
			pages: {
				'/': {
					containers: [
						{
							name: 'BoxDate',
						},
					],
				},
			},
		});

		expect(warnings).toEqual([
			expect.stringContaining('"BoxServices"'),
			expect.stringContaining('"BoxService"'),
		]);
	});

	it('returns an empty config for anything that is not an object', () => {
		expect(normalizeConfig('nope').config.pages).toEqual({});
		expect(normalizeConfig(undefined).config.pages).toEqual({});
	});

	it('returns an empty config for an object with no pages', () => {
		expect(
			normalizeConfig({
				defaults: {},
			}).config.pages,
		).toEqual({});
	});

	it('drops a page that is an array, which would render as a dead nav link', () => {
		const { config: dropped } = normalizeConfig({
			pages: {
				'/array': [],
			},
		});

		expect(Object.keys(dropped.pages)).toEqual([]);
	});

	it('gives a page whose containers are not an array an empty list', () => {
		const page = normalizeConfig({
			pages: {
				'/': {
					containers: 'not an array',
				},
			},
		}).config.pages['/'];

		expect(page.containers).toEqual([]);
	});
});

describe('containers that would throw while rendering', () => {
	it('gives a Grid written before its children an empty items array', () => {
		// The most likely half-finished hand edit. `items` used to stay undefined,
		// which threw in every traversal below and took the page to a 500.
		const { page } = pageWith({
			name: 'Grid',
			props: {
				title: 'Services',
			},
		});

		const [grid] = page.containers;

		expect(itemsOf(grid)).toEqual([]);
	});

	it('leaves the traversals safe on a Grid with no items', () => {
		const { page } = pageWith({
			name: 'Grid',
			props: {
				title: 'Services',
			},
		});

		expect(() => collectStatsTargets(page.containers)).not.toThrow();
		expect(() => collectServiceProbes(page.containers)).not.toThrow();
	});

	it('drops a BoxService with no img, which would throw during SSR', () => {
		const { page, warnings } = pageWith({
			name: 'BoxService',
			props: {
				title: 'Proxmox',
				href: 'https://proxmox.local:8006',
			},
		});

		expect(page.containers).toEqual([]);
		expect(warnings).toEqual([expect.stringContaining('img.src')]);
	});

	it('drops a BoxService with no href', () => {
		const { page, warnings } = pageWith({
			name: 'BoxService',
			props: {
				title: 'Proxmox',
				img: {
					src: 'https://icons.local/p.svg',
				},
			},
		});

		expect(page.containers).toEqual([]);
		expect(warnings).toEqual([expect.stringContaining('href')]);
	});

	it('drops a BoxService whose href is not a string', () => {
		const { page } = pageWith({
			name: 'BoxService',
			props: {
				href: 42,
				img: {
					src: 'https://icons.local/p.svg',
				},
			},
		});

		expect(page.containers).toEqual([]);
	});

	it('drops a BoxStats with no href', () => {
		const { page, warnings } = pageWith({
			name: 'BoxStats',
			props: {
				provider: 'adguard',
			},
		});

		expect(page.containers).toEqual([]);
		expect(warnings).toEqual([expect.stringContaining('href')]);
	});

	it('drops a BoxStats naming a provider that does not exist', () => {
		const { page, warnings } = pageWith({
			name: 'BoxStats',
			props: {
				provider: 'pi-hole',
				href: 'http://pihole.local',
			},
		});

		expect(page.containers).toEqual([]);
		expect(warnings).toEqual(['Skipping container "BoxStats", "provider" is missing or not valid']);
	});

	/**
	 * A shell cannot export `DASHBOARD_SECRET_ADGUARD-MAIN`, so a name with punctuation in
	 * it points at a variable that can never be set — the box would be skipped forever with
	 * only a log line. Refused at the schema instead, where the editor says which prop.
	 */
	it('drops a BoxStats whose secret is not a variable name a shell can export', () => {
		const { page, warnings } = pageWith({
			name: 'BoxStats',
			props: {
				provider: 'adguard',
				href: 'http://adguard.local',
				secret: 'ADGUARD-MAIN',
			},
		});

		expect(page.containers).toEqual([]);
		expect(warnings).toEqual([expect.stringContaining('secret')]);
	});

	// A public Uptime Kuma status page takes no credential at all, so `secret` has to be
	// optional. A provider that DOES need one and names no variable is not blessed by this:
	// it is read anonymously and answers 401, which is an ordinary failure that toasts.
	it('keeps a BoxStats with no secret, which is a provider that needs none', () => {
		const { page, warnings } = pageWith({
			name: 'BoxStats',
			props: {
				provider: 'uptime-kuma',
				href: 'https://kuma.local/status/home',
			},
		});

		expect(warnings).toEqual([]);
		expect(page.containers.map((item) => item.name)).toEqual(['BoxStats']);
	});

	it('keeps a BoxDate, which requires nothing', () => {
		const { page } = pageWith({
			name: 'BoxDate',
		});

		expect(page.containers.map((c) => c.name)).toEqual(['BoxDate']);
	});

	it('drops a bad child without dropping its siblings or the grid', () => {
		const { page } = pageWith({
			name: 'Grid',
			props: {
				items: [
					{
						name: 'BoxService',
						props: {
							title: 'no img',
						},
					},
					{
						name: 'BoxDate',
					},
				],
			},
		});

		expect(itemsOf(page.containers[0]).map((c) => c.name)).toEqual(['BoxDate']);
	});
});

describe('collectStatsTargets', () => {
	function statsAt(href: string, secret?: string) {
		return {
			name: 'BoxStats',
			props: {
				provider: 'adguard',
				href,
				...(secret === undefined
					? undefined
					: {
							secret,
						}),
			},
		};
	}

	it('collects instances at any nesting depth, carrying what the config named', () => {
		expect(collectStatsTargets(home.containers)).toEqual([
			{
				key: statsKey('adguard', 'http://adguard.local'),
				provider: 'adguard',
				href: 'http://adguard.local',
				secret: 'ADGUARD_MAIN',
			},
		]);
	});

	/** The defect #17 closed: the load read the first match and every box rendered it. */
	it('collects every instance on the page, in the order the file names them', () => {
		const { page } = pageWith(statsAt('http://first.local'), {
			name: 'Grid',
			props: {
				items: [statsAt('http://second.local')],
			},
		});

		expect(collectStatsTargets(page.containers).map((target) => target.href)).toEqual([
			'http://first.local',
			'http://second.local',
		]);
	});

	/**
	 * First occurrence wins, as `collectServiceProbes` does: two boxes naming one target
	 * with two secrets is a config to fix, not a case worth arbitrating.
	 */
	it('returns one entry however many boxes on the page name the same target', () => {
		const { page } = pageWith(
			statsAt('http://one.local', 'FIRST'),
			statsAt('http://one.local', 'SECOND'),
		);

		expect(collectStatsTargets(page.containers)).toEqual([
			{
				key: statsKey('adguard', 'http://one.local'),
				provider: 'adguard',
				href: 'http://one.local',
				secret: 'FIRST',
			},
		]);
	});

	it('returns nothing for a page with no stats box', () => {
		const { page } = pageWith({
			name: 'BoxDate',
			props: {},
		});

		expect(collectStatsTargets(page.containers)).toEqual([]);
	});

	// The key is what the cache, the page record and the store all address a reading by, so
	// an href alone would let two providers at one host serve each other's numbers.
	it('keys on the provider as well as the href', () => {
		const key = statsKey('adguard', 'http://one.local');

		expect(key).toContain('adguard');
		expect(key).toContain('http://one.local');
	});
});

describe('collectServiceProbes', () => {
	function boxAt(href: string, probe?: string) {
		return {
			name: 'BoxService',
			props: {
				title: 'Proxmox',
				href,
				img: {
					src: 'https://icons.local/p.svg',
				},
				...(probe === undefined
					? undefined
					: {
							probe,
						}),
			},
		};
	}

	it('collects services at any nesting depth, defaulting the mode to tcp', () => {
		expect(collectServiceProbes(home.containers)).toEqual([
			{
				href: 'https://proxmox.local:8006',
				probe: 'tcp',
			},
		]);
	});

	it('carries the mode the config chose', () => {
		const { page } = pageWith(boxAt('https://pages.local/docs/', 'http'));

		expect(collectServiceProbes(page.containers)).toEqual([
			{
				href: 'https://pages.local/docs/',
				probe: 'http',
			},
		]);
	});

	/**
	 * The whole point of the mode. Both callers are consequences of appearing in this list:
	 * the poll measures it, and `/api/ping` will connect to it for anyone who asks. A
	 * bookmark has to be absent, not filtered downstream by each of them in turn.
	 */
	it('leaves out a probe:none box, so it is neither polled nor allowlisted', () => {
		const { page } = pageWith(boxAt('https://bookmark.local/', 'none'), {
			name: 'Grid',
			props: {
				items: [boxAt('https://real.local:8006')],
			},
		});

		expect(collectServiceProbes(page.containers)).toEqual([
			{
				href: 'https://real.local:8006',
				probe: 'tcp',
			},
		]);
	});

	it('returns one entry however many boxes on the page name the same href', () => {
		const box = boxAt('https://proxmox.local:8006');

		const { page } = pageWith(box, {
			name: 'Grid',
			props: {
				items: [box],
			},
		});

		expect(collectServiceProbes(page.containers)).toEqual([
			{
				href: 'https://proxmox.local:8006',
				probe: 'tcp',
			},
		]);
	});

	it('drops an unknown mode with a warning rather than probing it', () => {
		const { warnings, page } = pageWith(boxAt('https://proxmox.local:8006', 'htpp'));

		expect(warnings).toEqual(['Skipping container "BoxService", "probe" is missing or not valid']);

		expect(collectServiceProbes(page.containers)).toEqual([]);
	});
});

/**
 * Fills a container's props the way a generated form does: one key per described field,
 * at the path the description names. Nested, because `img.src` is two levels down.
 */
function fillFields(fields: ContainerField[], onlyRequired: boolean) {
	const props: Record<string, unknown> = {};

	for (const field of fields.filter((item) => item.isRequired || !onlyRequired)) {
		const keys = field.path.split('.');
		let node = props;

		for (const key of keys.slice(0, -1)) {
			const created = {};

			node[key] = created;
			node = created;
		}

		node[keys[keys.length - 1]] = fillValue(field);
	}

	return props;
}

function fillValue(field: ContainerField): unknown {
	if (field.kind === 'children') {
		return [];
	}

	if (field.kind === 'number') {
		return 1;
	}

	// The reason `enum` had to become a kind of its own. Every other field is satisfied by
	// any value of its type, so `'x'` fills them; an enum accepts only what the schema
	// names, and `'x'` would be dropped with a warning — which is what these tests assert
	// does not happen to a form-filled container.
	if (field.kind === 'enum') {
		return field.options?.[0];
	}

	return 'x';
}

function normalizeFilled(onlyRequired: boolean) {
	return normalizeConfig({
		pages: {
			'/': {
				containers: containerNames.map((name) => ({
					name,
					props: fillFields(containerFields[name], onlyRequired),
				})),
			},
		},
	});
}

// The claim the generated form rests on: the descriptions are walked out of
// `containerSchemas`, so a container added there is offered with its props and nothing
// else has to be edited. Asserted over `containerNames` rather than the five names, so a
// sixth container is covered the moment it is declared — and asserted THROUGH
// `normalizeConfig`, which is what makes it a real check: a required prop the walk failed
// to describe is a container the form cannot fill, and an unfillable container is dropped
// with a warning here.
describe('containerFields', () => {
	it('describes every declared container', () => {
		expect(Object.keys(containerFields)).toEqual(containerNames);
		expect(containerNames.length).toBeGreaterThan(0);

		for (const name of containerNames) {
			expect(containerFields[name].length).toBeGreaterThan(0);
		}
	});

	it('describes every required prop, so a form can fill a savable container', () => {
		const { config, warnings } = normalizeFilled(true);

		expect(warnings).toEqual([]);
		expect(config.pages['/'].containers.map((item) => item.name)).toEqual(containerNames);
	});

	it('describes every optional prop with a kind the schema accepts', () => {
		const { warnings } = normalizeFilled(false);

		expect(warnings).toEqual([]);
	});

	it('walks a nested object down to the path an operator has to write', () => {
		expect(containerFields.BoxService).toContainEqual({
			path: 'img.src',
			kind: 'string',
			isRequired: true,
		});
	});

	/**
	 * The editor offers a choice instead of a text box only if the walk hands over the
	 * values. Without them it renders an ordinary field, and every save where an operator
	 * typed a near-miss is refused with a diagnostic — for a prop the form itself offered.
	 */
	it('carries an enum field the values the schema accepts', () => {
		expect(containerFields.BoxService).toContainEqual({
			path: 'probe',
			kind: 'enum',
			isRequired: false,
			options: ['tcp', 'http', 'none'],
		});
	});

	/**
	 * `provider` is the first REQUIRED picklist, and it has to reach the form with its
	 * values: without them the editor renders a text box whose every near-miss is a refused
	 * save, for a prop the form itself invited. Asserted against `providerNames` rather than
	 * a literal list, so a provider added to the schema is covered the moment it is declared.
	 */
	it('offers every provider a config may name, as a required choice', () => {
		expect(containerFields.BoxStats).toContainEqual({
			path: 'provider',
			kind: 'enum',
			isRequired: true,
			options: providerNames,
		});
	});

	/**
	 * `secret` names a variable, so an operator has to be able to leave it out — a provider
	 * needing none would otherwise be unfillable. A `pipe`d string still describes as text.
	 */
	it('describes a piped optional string as an omittable text field', () => {
		expect(containerFields.BoxStats).toContainEqual({
			path: 'secret',
			kind: 'string',
			isRequired: false,
		});
	});

	it('reports an optional with no default as omittable', () => {
		expect(containerFields.BoxDate).toEqual([
			{
				path: 'span',
				kind: 'number',
				isRequired: false,
			},
		]);
	});

	it('reports a nested container list as children rather than as a value', () => {
		expect(containerFields.Grid).toContainEqual({
			path: 'items',
			kind: 'children',
			isRequired: true,
		});
	});
});

// The admin editor REFUSES to write a config that produces warnings, so a shipped
// config that produces one could never be saved from it — not even unedited. Read from
// disk, because the point is the files themselves and not a copy of them.
describe('the configs this repo ships', () => {
	it.each(['config.example.json', 'e2e/fixture-config.json'])(
		'%s normalizes without a single warning',
		(path) => {
			const { warnings } = normalizeConfig(JSON.parse(readFileSync(path, 'utf8')));

			expect(warnings).toEqual([]);
		},
	);
});
