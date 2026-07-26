import BoxServiceWrapper from '$lib/components/box-service-wrapper.svelte';
import BoxDate from '$lib/components/box-date.svelte';
import Grid from '$lib/components/grid.svelte';
import SubGrid from '$lib/components/sub-grid.svelte';
import BoxAdguardWrapper from '$lib/components/box-adguard-wrapper.svelte';

/**
 * Every component a config file may name. The registry types the config; the
 * rendering happens in config-container.svelte.
 */
export const componentRegistry = {
	BoxService: BoxServiceWrapper,
	BoxAdguard: BoxAdguardWrapper,
	BoxDate,
	Grid,
	SubGrid
};

export type ComponentRegistry = typeof componentRegistry;

export type ComponentName = keyof ComponentRegistry;

export function isComponentName(name: string): name is ComponentName {
	return name in componentRegistry;
}
