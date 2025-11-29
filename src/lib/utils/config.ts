import type { ComponentProps } from 'svelte';
import BoxServiceWrapper from '$lib/components/box-service-wrapper.svelte';
import BoxDate from '$lib/components/box-date.svelte';
import Grid from '$lib/components/grid.svelte';
import SubGrid from '$lib/components/sub-grid.svelte';
import BoxAdguard from '$lib/components/box-adguard.svelte';

export const componentRegistry = {
	BoxService: BoxServiceWrapper,
	BoxAdguard,
	BoxDate,
	Grid,
	SubGrid
};

type ComponentRegistry = typeof componentRegistry;

type ComponentName = keyof ComponentRegistry;

export interface ConfigContainer<N extends ComponentName = ComponentName> {
	name: N;
	props: ComponentProps<ComponentRegistry[N]>;
}

type ConfigDefault = Partial<{
	[key in ComponentName]: ConfigContainer['props'];
}>;

type ConfigPage = {
	title?: string;
	containers?: ConfigContainer[];
};

export type Config = {
	defaults?: ConfigDefault;
	pages?: {
		[path: string]: ConfigPage;
	};
};

export type TransformConfigOutput<N extends ComponentName = ComponentName> = {
	component: ComponentRegistry[N];
} & ConfigContainer<N>;

function mapContainer(
	item: ConfigContainer,
	fn: (item: ConfigContainer) => TransformConfigOutput,
	defaults: Config['defaults']
): TransformConfigOutput {
	const mapped = fn(item);

	if (isGrid(mapped)) {
		mapped.props.items = mapped.props.items.map((child) => mapContainer(child, fn, defaults));
	}

	return mapped;
}

function transformConfigContainer(
	item: ConfigContainer,
	defaults: Config['defaults'] = {}
): TransformConfigOutput {
	return mapContainer(
		item,
		(it) => {
			const merged = (() => {
				if (isGrid(it)) {
					return {
						class: `${defaults[it.name]?.class || ''} ${it.props?.class}`,
						gridClass: `${defaults[it.name]?.class || ''} ${it.props?.gridClass}`
					};
				}

				return {
					class: `${it.props?.class} ${defaults[it.name]?.class || ''}`
				};
			})();

			return {
				name: it.name,
				component: componentRegistry[it.name],
				props: {
					...defaults[it.name],
					...it.props,
					...merged
				}
			};
		},
		defaults
	);
}

export function getContainers(
	containers: ConfigContainer[] = [],
	defaults: Config['defaults']
): TransformConfigOutput[] {
	return containers.map((item) => transformConfigContainer(item, defaults));
}

function scanContainer(item: ConfigContainer, target: string): ConfigContainer | void {
	if (item.name === target) {
		return item;
	}

	if (isGrid(item)) {
		for (const child of item.props.items) {
			if (scanContainer(child, target)) {
				return item;
			}
		}
	}
}

export function recursiveScan(page: ConfigPage, target: string): ConfigContainer | void {
	for (const container of page.containers || []) {
		if (scanContainer(container, target)) {
			return container;
		}
	}
}

export function isBoxService(item: ConfigContainer): item is ConfigContainer<'BoxService'> {
	return item.name === 'BoxService';
}

export function isGrid(
	item: ConfigContainer
): item is ConfigContainer<'Grid'> | ConfigContainer<'SubGrid'> {
	return item.name === 'Grid' || item.name === 'SubGrid';
}

export function isBoxAdguard(item: ConfigContainer): item is ConfigContainer<'BoxAdguard'> {
	return item.name === 'BoxAdguard';
}
