import type { ComponentProps } from 'svelte';
import type { ConfigContainer, ContainerName } from '$lib/business/model/config';
import type BoxDate from '$lib/presentation/components/box-date.svelte';
import type BoxFeedWrapper from '$lib/presentation/components/box-feed-wrapper.svelte';
import type BoxSearch from '$lib/presentation/components/box-search.svelte';
import type BoxServiceWrapper from '$lib/presentation/components/box-service-wrapper.svelte';
import type BoxStatsWrapper from '$lib/presentation/components/box-stats-wrapper.svelte';
import type Grid from '$lib/presentation/components/grid.svelte';
import type SubGrid from '$lib/presentation/components/sub-grid.svelte';
import { expect, it } from 'vitest';
import { containerNames } from '$lib/business/model/config';

/**
 * The half of the config→component seam that `{...container.props}` cannot give you.
 * TypeScript does not excess-property-check a spread of a typed VALUE, so a component
 * can stop reading a prop the schema still declares and nothing anywhere fails.
 * Measured: renaming BoxService's `title: string` to `heading?: string` with a default
 * keeps svelte-check at 0 errors, turns config's `title` into the anchor's tooltip and
 * renders an empty heading on every service box. A REQUIRED-prop rename does fail at the
 * spread, which is why that is the one escape and why this file is the fence for it.
 *
 * It sits in presentation because only this side may name both layers: business importing
 * `ComponentProps` is the upward crossing eslint blocks. Nothing mounts — the component
 * imports are types, erased before the node project runs this.
 *
 * The cost is a third component-adjacent spec where AGENTS.md keeps exactly two, and the
 * rule for a third is that it names what a story cannot reach. No story can assert a type.
 */

/** Identical, not merely assignable: mutual assignability accepts an added optional prop. */
type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * `WithChildren` leaves a nesting container's props an INTERSECTION, and an intersection
 * is never IDENTICAL to the flat object a component declares however well its members
 * match. Both sides go through this so the comparison is between two object types.
 */
type Flat<T> = {
	[K in keyof T]: T[K];
};

/** What config promises for one container against what its branch actually hands over. */
type Fence<Promised, Handed> = Equals<Flat<Promised>, Flat<Handed>>;

/**
 * `false` on either side of a `Fence` fails the `satisfies` and the compile with it.
 *
 * Every omission is one of the seam's own asymmetries, each decided elsewhere:
 * `headingLevel` is the renderer's to choose because a box cannot know its own depth,
 * `class` / `gridClass` are declared for a component's own callers and stripped from
 * config by `STYLE_KEYS`, and `secret` is the one prop config carries that must never
 * reach a component at all — box-stats.svelte says why.
 */
const seams: Record<ContainerName, true> = {
	BoxService: true satisfies Fence<
		ConfigContainer<'BoxService'>['props'],
		Omit<ComponentProps<typeof BoxServiceWrapper>, 'headingLevel' | 'class'>
	>,
	BoxStats: true satisfies Fence<
		Omit<ConfigContainer<'BoxStats'>['props'], 'secret'>,
		Omit<ComponentProps<typeof BoxStatsWrapper>, 'class'>
	>,
	BoxDate: true satisfies Fence<
		ConfigContainer<'BoxDate'>['props'],
		Omit<ComponentProps<typeof BoxDate>, 'class'>
	>,
	BoxSearch: true satisfies Fence<
		ConfigContainer<'BoxSearch'>['props'],
		ComponentProps<typeof BoxSearch>
	>,
	// The wrapper's own Props are an intersection (`Omit<BoxFeed's, 'items'> & { href }`),
	// so `Flat` is what makes the comparison two flat objects — the same reason Grid and
	// SubGrid go through it.
	BoxFeed: true satisfies Fence<
		ConfigContainer<'BoxFeed'>['props'],
		ComponentProps<typeof BoxFeedWrapper>
	>,
	Grid: true satisfies Fence<
		ConfigContainer<'Grid'>['props'],
		Omit<ComponentProps<typeof Grid>, 'headingLevel' | 'class' | 'gridClass'>
	>,
	SubGrid: true satisfies Fence<
		ConfigContainer<'SubGrid'>['props'],
		Omit<ComponentProps<typeof SubGrid>, 'headingLevel' | 'class' | 'gridClass'>
	>,
};

it('fences every container the schema declares', () => {
	expect(Object.keys(seams).sort()).toEqual([...containerNames].sort());
});
