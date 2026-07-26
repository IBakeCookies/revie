import type { ConfigContainer } from '$lib/utils/config';
import { describe, expect, it } from 'vitest';
import {
	collectServiceHrefs,
	findContainer,
	isBoxAdguard,
	isGrid,
	normalizeConfig
} from '$lib/utils/config';

const rawConfig = {
	defaults: {
		BoxService: { span: 6 }
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
											props: { href: 'http://adguard.local' }
										},
										{
											name: 'BoxService',
											props: {
												title: 'Proxmox',
												href: 'https://proxmox.local:8006'
											}
										}
									]
								}
							},
							{ name: 'NotAComponent' },
							'not a container'
						]
					}
				}
			]
		},
		'/broken': 'not a page'
	}
};

const config = normalizeConfig(rawConfig);
const home = config.pages['/'];
const grid = home.containers[0];

function itemsOf(container: ConfigContainer): ConfigContainer[] {
	return isGrid(container) ? container.props.items : [];
}

describe('normalizeConfig', () => {
	it('keeps only well-formed pages and containers', () => {
		expect(Object.keys(config.pages)).toEqual(['/']);
		expect(home.name).toBe('Home');
		expect(home.containers).toHaveLength(1);
	});

	it('drops unregistered components and entries that are not containers', () => {
		expect(grid.name).toBe('Grid');
		expect(itemsOf(grid).map((item) => item.name)).toEqual(['SubGrid']);
	});

	it('clamps span to the number of grid columns', () => {
		expect(grid.props.span).toBe(12);
	});

	it('strips class names, which could never reach the Tailwind build', () => {
		expect(grid.props.class).toBeUndefined();
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
});
