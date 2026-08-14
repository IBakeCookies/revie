import type { ConfigContainer, ContainerField } from '$lib/business/model/config';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	collectServiceHrefs,
	containerFields,
	containerNames,
	findContainer,
	isBoxAdguard,
	isGrid,
	normalizeConfig,
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
											name: 'BoxAdguard',
											props: {
												href: 'http://adguard.local',
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

	it('applies per-component defaults at any nesting depth', () => {
		const nested = itemsOf(itemsOf(grid)[0]);

		expect(nested.map((item) => item.name)).toEqual(['BoxAdguard', 'BoxService']);
		expect(nested[1].props.span).toBe(6);
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

		expect(() => findContainer(page, 'BoxAdguard')).not.toThrow();
		expect(() => collectServiceHrefs(page.containers)).not.toThrow();
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

	it('drops a BoxAdguard with no href', () => {
		const { page, warnings } = pageWith({
			name: 'BoxAdguard',
		});

		expect(page.containers).toEqual([]);
		expect(warnings).toEqual([expect.stringContaining('href')]);
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

describe('findContainer', () => {
	it('finds a nested container instead of its ancestor', () => {
		const found = findContainer(home, 'BoxAdguard');

		expect(found && isBoxAdguard(found) && found.props.href).toBe('http://adguard.local');
	});

	it('returns undefined when nothing matches', () => {
		expect(findContainer(home, 'BoxDate')).toBeUndefined();
	});
});

describe('collectServiceHrefs', () => {
	it('collects hrefs at any nesting depth', () => {
		expect(collectServiceHrefs(home.containers)).toEqual(['https://proxmox.local:8006']);
	});

	it('returns one href however many boxes on the page name it', () => {
		const box = {
			name: 'BoxService',
			props: {
				title: 'Proxmox',
				href: 'https://proxmox.local:8006',
				img: {
					src: 'https://icons.local/p.svg',
				},
			},
		};

		const { page } = pageWith(box, {
			name: 'Grid',
			props: {
				items: [box],
			},
		});

		expect(collectServiceHrefs(page.containers)).toEqual(['https://proxmox.local:8006']);
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

		node[keys[keys.length - 1]] =
			field.kind === 'children' ? [] : field.kind === 'number' ? 1 : 'x';
	}

	return props;
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
