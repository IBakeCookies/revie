<script lang="ts">
	import type { ConfigContainer } from '$lib/utils/config';
	import BoxAdguardWrapper from '$lib/components/box-adguard-wrapper.svelte';
	import BoxDate from '$lib/components/box-date.svelte';
	import BoxServiceWrapper from '$lib/components/box-service-wrapper.svelte';
	import Grid from '$lib/components/grid.svelte';
	import SubGrid from '$lib/components/sub-grid.svelte';

	export type Props = {
		container: ConfigContainer;
	};

	let { container }: Props = $props();
</script>

<!--
	Naming each component explicitly is what keeps this type-checked: a component
	held in a variable has no statically known props, so spreading config props into
	it would need an `any`. Adding a component means extending the registry and this
	list.
-->
{#if container.name === 'Grid'}
	<Grid {...container.props} />
{:else if container.name === 'SubGrid'}
	<SubGrid {...container.props} />
{:else if container.name === 'BoxService'}
	<BoxServiceWrapper {...container.props} />
{:else if container.name === 'BoxAdguard'}
	<BoxAdguardWrapper {...container.props} />
{:else if container.name === 'BoxDate'}
	<BoxDate {...container.props} />
{/if}
