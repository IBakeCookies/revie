<script lang="ts">
	import type { AdguardStats } from '$lib/business/type/adguard-stats';
	import type { ConfigContainer } from '$lib/business/model/config';
	import type { NotifyProbeFailed } from '$lib/business/store/service-store.svelte';
	import ConfigContainerView from '$lib/presentation/components/config-container.svelte';
	import { pollServicesState } from '$lib/business/store/poll-services-state';
	import { setAdguardStore } from '$lib/business/store/adguard-store.svelte';
	import { setServicesStore } from '$lib/business/store/service-store.svelte';

	export type Props = {
		adguard: AdguardStats | null;
		containers: ConfigContainer[];
		/**
		 * Told which href failed to probe, so the route can raise a toast in the user's
		 * language. Injected rather than read from context, so this component stays
		 * mountable without a layout above it — which `page.stories.svelte` is. Left
		 * out, the failure is still logged by the store; only the toast is missing.
		 */
		notify?: NotifyProbeFailed;
	};

	let { adguard, containers, notify }: Props = $props();

	// The sink is fixed for the life of the page — the route reads it from a store set
	// one level up, which outlives this component.
	// svelte-ignore state_referenced_locally
	const servicesStore = setServicesStore(notify);

	setAdguardStore(() => adguard ?? undefined);

	$effect(() => pollServicesState(servicesStore, containers));
</script>

{#each containers as container, index (index)}
	<ConfigContainerView {container} />
{/each}
