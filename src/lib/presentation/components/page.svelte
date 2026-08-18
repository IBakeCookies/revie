<script lang="ts">
	import type { ConfigContainer } from '$lib/business/model/config';
	import type { NotifyProbeFailed } from '$lib/business/store/service-store.svelte';
	import type { Stat } from '$lib/business/type/stats';
	import ConfigContainerView from '$lib/presentation/components/config-container.svelte';
	import { pollServicesState, serviceProbeKey } from '$lib/business/store/poll-services-state';
	import { setServicesStore } from '$lib/business/store/service-store.svelte';
	import { setStatsStore } from '$lib/business/store/stats-store.svelte';

	export type Props = {
		/** Keyed by `statsKey(provider, href)`, exactly as the load returned it. */
		stats: Record<string, Stat[]>;
		containers: ConfigContainer[];
		/**
		 * Told which href failed to probe, so the route can raise a toast in the user's
		 * language. Injected rather than read from context, so this component stays
		 * mountable without a layout above it — which `page.stories.svelte` is. Left
		 * out, the failure is still logged by the store; only the toast is missing.
		 */
		notify?: NotifyProbeFailed;
	};

	let { stats, containers, notify }: Props = $props();

	// The sink is fixed for the life of the page — the route reads it from a store set
	// one level up, which outlives this component.
	// svelte-ignore state_referenced_locally
	const servicesStore = setServicesStore(notify);

	setStatsStore(() => stats);

	// The key, not `containers`: the stats refresh in `[...slug]/+page.svelte` re-runs the
	// load every 60s and hands this component a rebuilt array each time, so an effect
	// tracking the array restarted the 15-minute poll every minute — re-probing every
	// service on the way, and re-toasting one that keeps failing.
	const probeKey = $derived(serviceProbeKey(containers));

	$effect(() => pollServicesState(servicesStore, probeKey));
</script>

{#each containers as container, index (index)}
	<ConfigContainerView {container} />
{/each}
