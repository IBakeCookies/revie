import type { ComponentProps } from 'svelte';
import type { ComponentRegistry, ComponentName } from '$lib/utils/component-registry';
import { componentRegistry } from '$lib/utils/component-registry';

export interface ConfigContainer<N extends ComponentName = ComponentName> {
	name: N;
	props: ComponentProps<ComponentRegistry[N]>;
}

type ConfigDefault = Partial<{
	[key in ComponentName]: ConfigContainer['props'];
}>;

type ConfigPage = {
	name?: string;
	containers?: ConfigContainer[];
};

export type Config = {
	defaults?: ConfigDefault;
	layout?: {
		gridClass?: string;
	};
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
				const defaultClass = defaults[it.name]?.class || '';
				const propsClass = it.props?.class || '';

				if (isGrid(it)) {
					return {
						class: `${defaultClass} ${propsClass}`,
						gridClass: `${defaultClass} ${it.props?.gridClass || ''}`
					};
				}

				return {
					class: `${defaultClass} ${propsClass} `
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
			const result = scanContainer(child, target);

			if (result) {
				return result;
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
