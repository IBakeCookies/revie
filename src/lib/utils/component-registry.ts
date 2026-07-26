/**
 * Every component a config file may name. This module TYPES the config; the
 * rendering happens in config-container.svelte, which names each component
 * explicitly so the props stay statically checked.
 *
 * The component imports are deliberately `import type`. They used to be value
 * imports, which meant the map — whose only runtime use is the name check at the
 * bottom — dragged all five Svelte components into everything that touched these
 * types, `utils/config.ts` included, and from there into the `/api/ping` endpoint's
 * server bundle. It also inverted the layer rule: a leaf module must not depend on
 * presentation. `import type` is erased at compile time, so the graph stays clean
 * while the types stay exact.
 */

import type BoxAdguardWrapper from '$lib/components/box-adguard-wrapper.svelte';
import type BoxDate from '$lib/components/box-date.svelte';
import type BoxServiceWrapper from '$lib/components/box-service-wrapper.svelte';
import type Grid from '$lib/components/grid.svelte';
import type SubGrid from '$lib/components/sub-grid.svelte';

export interface ComponentRegistry {
	BoxService: typeof BoxServiceWrapper;
	BoxAdguard: typeof BoxAdguardWrapper;
	BoxDate: typeof BoxDate;
	Grid: typeof Grid;
	SubGrid: typeof SubGrid;
}

export type ComponentName = keyof ComponentRegistry;

/**
 * The names as runtime data. Typed as a complete `Record<ComponentName, true>` so
 * it cannot drift from the registry above: a missing name and an unknown one are
 * both compile errors.
 */
const COMPONENT_NAMES: Record<ComponentName, true> = {
	BoxService: true,
	BoxAdguard: true,
	BoxDate: true,
	Grid: true,
	SubGrid: true
};

export function isComponentName(name: string): name is ComponentName {
	return name in COMPONENT_NAMES;
}
