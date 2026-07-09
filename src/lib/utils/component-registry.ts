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

export type ComponentRegistry = typeof componentRegistry;

export type ComponentName = keyof ComponentRegistry;
