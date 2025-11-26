import type { ComponentProps } from 'svelte';
import BoxServiceWrapper from '$lib/components/box-service-wrapper.svelte';
import BoxDate from '$lib/components/box-date.svelte';
import Grid from '$lib/components/grid.svelte';
import BoxAdguard from '$lib/components/box-adguard.svelte';

export const componentRegistry = {
	BoxService: BoxServiceWrapper,
	BoxAdguard,
	BoxDate,
	Grid
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

export type Config = {
	defaults?: ConfigDefault;
	containers?: ConfigContainer[];
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
		(it) => ({
			name: it.name,
			component: componentRegistry[it.name],
			props: { ...defaults[it.name], ...it.props }
		}),
		defaults
	);
}

export function getContainers(config: Config): TransformConfigOutput[] {
	const containers = config.containers || [];

	return containers.map((item) => transformConfigContainer(item, config.defaults));
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

export function recursiveScan(config: Config, target: string): ConfigContainer | void {
	for (const container of config.containers || []) {
		if (scanContainer(container, target)) {
			return container;
		}
	}
}

export function isBoxService(item: ConfigContainer): item is ConfigContainer<'BoxService'> {
	return item.name === 'BoxService';
}

export function isGrid(item: ConfigContainer): item is ConfigContainer<'Grid'> {
	return item.name === 'Grid';
}

export function isBoxAdguard(item: ConfigContainer): item is ConfigContainer<'BoxAdguard'> {
	return item.name === 'BoxAdguard';
}
