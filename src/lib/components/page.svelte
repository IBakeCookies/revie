<script lang="ts">
	import { type GetAdguardStatsOutput } from '$lib/data/repository/adguard';
	import { type Config } from '$lib/utils/config';
	import { onMount } from 'svelte';
	import { getContainers } from '$lib/utils/config';
	import { pollServicesState } from '$lib/utils/poll-services-state';
	import { setAdguardStore } from '$lib/store/adguard-store.svelte';
	import { page } from '$app/state';

	export type Props = {
		adguard: GetAdguardStatsOutput | null;
		config: Config;
	};

	let { adguard, config }: Props = $props();

	const containers = $derived.by(() => {
		if (!config?.pages) {
			return [];
		}

		return getContainers(config?.pages[page.url.pathname].containers, config.defaults);
	});

	if (adguard) {
		setAdguardStore(adguard);
	}

	onMount(() => {
		const stopPolling = pollServicesState(containers);
		return stopPolling;
	});
</script>

{#each containers as container}
	{@const Component = container.component as any}

	{#if Component}
		<Component {...container.props} />
	{:else}
		<p class="text-xl font-bold text-red-500">Unknown component: {container.name}</p>
	{/if}
{/each}
