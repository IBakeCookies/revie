import type { ConfigContainer } from '$lib/business/model/config';
import { describe, expect, it, vi } from 'vitest';
import {
	collectServiceHrefs,
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

const config = normalizeConfig(rawConfig);
const home = config.pages['/'];
const grid = home.containers[0];

function itemsOf(container: ConfigContainer): ConfigContainer[] {
	return isGrid(container) ? container.props.items : [];
}

function pageWith(...containers: unknown[]) {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

	const page = normalizeConfig({
		pages: {
			'/': {
				containers,
			},
		},
	}).pages['/'];

	return {
		page,
		warn,
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
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const pages = normalizeConfig({
			pages: {
				noslash: {
					containers: [],
				},
			},
		}).pages;

		expect(Object.keys(pages)).toEqual([]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('noslash'));
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
		const { page, warn } = pageWith({
			name: 'BoxDate',
			props: {
				span: '6',
			},
		});

		expect(page.containers[0].props.span).toBeUndefined();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('span'));
	});

	it('strips class names, which could never reach the Tailwind build', () => {
		// Cast because the schema deliberately has no `class` — this asserts the
		// runtime object does not carry one either.
		expect((grid.props as Record<string, unknown>).class).toBeUndefined();
	});

	it('strips gridClass as well as class', () => {
		const { page, warn } = pageWith({
			name: 'Grid',
			props: {
				gridClass: 'grid-cols-3',
			},
		});

		expect((page.containers[0].props as Record<string, unknown>).gridClass).toBeUndefined();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('gridClass'));
	});

	it('applies per-component defaults at any nesting depth', () => {
		const nested = itemsOf(itemsOf(grid)[0]);

		expect(nested.map((item) => item.name)).toEqual(['BoxAdguard', 'BoxService']);
		expect(nested[1].props.span).toBe(6);
	});

	it('returns an empty config for anything that is not an object', () => {
		expect(normalizeConfig('nope').pages).toEqual({});
		expect(normalizeConfig(undefined).pages).toEqual({});
	});

	it('returns an empty config for an object with no pages', () => {
		expect(
			normalizeConfig({
				defaults: {},
			}).pages,
		).toEqual({});
	});

	it('gives a page whose containers are not an array an empty list', () => {
		const page = normalizeConfig({
			pages: {
				'/': {
					containers: 'not an array',
				},
			},
		}).pages['/'];

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
		const { page, warn } = pageWith({
			name: 'BoxService',
			props: {
				title: 'Proxmox',
				href: 'https://proxmox.local:8006',
			},
		});

		expect(page.containers).toEqual([]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('img.src'));
	});

	it('drops a BoxService with no href', () => {
		const { page, warn } = pageWith({
			name: 'BoxService',
			props: {
				title: 'Proxmox',
				img: {
					src: 'https://icons.local/p.svg',
				},
			},
		});

		expect(page.containers).toEqual([]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('href'));
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
		const { page, warn } = pageWith({
			name: 'BoxAdguard',
		});

		expect(page.containers).toEqual([]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('href'));
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
