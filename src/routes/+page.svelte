<script lang="ts">
	import type { PageProps } from './$types';
	import { getContainers } from '$lib/utils/config';
	import {
		boxServiceStore,
		collectServiceHrefs,
		getServiceState
	} from '$lib/store/service-state-store.svelte';
	import { onMount } from 'svelte';
	import { getAdguardStore } from '$lib/store/adguard-store.svelte';

	let { data }: PageProps = $props();

	const adguardStore = getAdguardStore();
	const containers = getContainers(data.config);

	onMount(() => {
		if(data.adguard) {
			adguardStore.setStats(data.adguard);
		}
		
		const hrefs = collectServiceHrefs(data.config.containers || []);

		if (!hrefs.length) {
			return;
		}

		const poll = async () => {
			for (const href of hrefs) {
				const alive = await getServiceState(href);

				boxServiceStore.push({
					href,
					isAlive: alive
				});
			}
		};

		poll();

		const id = setInterval(poll, 60_000);

		return () => clearInterval(id);
	});
</script>

{#each containers as container}
	{@const Component = container.component}

	{#if Component}
		<Component {...container.props} />
	{:else}
		<p class="text-xl font-bold text-red-500">Unknown component: {container.name}</p>
	{/if}
{/each}
