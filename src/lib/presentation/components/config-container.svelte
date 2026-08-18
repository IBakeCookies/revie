<script lang="ts">
	import type { ConfigContainer } from '$lib/business/model/config';
	import BoxDate from '$lib/presentation/components/box-date.svelte';
	import BoxSearch from '$lib/presentation/components/box-search.svelte';
	import BoxServiceWrapper from '$lib/presentation/components/box-service-wrapper.svelte';
	import BoxStatsWrapper from '$lib/presentation/components/box-stats-wrapper.svelte';
	import Grid from '$lib/presentation/components/grid.svelte';
	import SubGrid from '$lib/presentation/components/sub-grid.svelte';

	export type Props = {
		container: ConfigContainer;
		/**
		 * Passed straight through to whatever below has a heading whose level depends
		 * on what it is rendered inside: a service tile's title, and a group's label
		 * on a card that draws no title of its own.
		 */
		headingLevel?: 2 | 3;
	};

	let { container, headingLevel }: Props = $props();

	/**
	 * Compile-time exhaustiveness. Every branch below narrows `container`, so by the
	 * `{:else}` it is `never` — and passing anything else to a `never` parameter is a
	 * type error. Add a container to the schema without a branch and this stops
	 * compiling, which is the whole point.
	 */
	function unhandled(value: never): string {
		return `No renderer for container "${(value as ConfigContainer).name}"`;
	}
</script>

<!--
	This is the seam between the two layers, and the only place they have to agree.
	Business declares the config schema (business/model/config.ts); each `{...props}`
	spread below is where the compiler checks that a component can actually accept
	what the schema promises, so a component prop that stops matching the config
	format fails HERE rather than silently changing what config.json means.

	Naming each component explicitly is what makes that check possible: a component
	held in a variable has no statically known props, so spreading into it would
	need an `any`. Adding a container to the schema means adding a branch here — the
	{:else} says so out loud instead of rendering nothing.
-->
{#if container.name === 'Grid'}
	<Grid {...container.props} {headingLevel} />
{:else if container.name === 'SubGrid'}
	<SubGrid {...container.props} {headingLevel} />
{:else if container.name === 'BoxService'}
	<BoxServiceWrapper {...container.props} {headingLevel} />
{:else if container.name === 'BoxStats'}
	<BoxStatsWrapper {...container.props} />
{:else if container.name === 'BoxDate'}
	<BoxDate {...container.props} />
{:else if container.name === 'BoxSearch'}
	<BoxSearch {...container.props} />
{:else}
	<p
		class="border-danger text-ty-secondary col-span-12 rounded-lg border bg-(--box-surface,var(--surface-card)) p-box-md backdrop-blur"
	>
		{unhandled(container)}
	</p>
{/if}
