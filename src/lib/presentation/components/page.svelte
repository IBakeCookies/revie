<script lang="ts">
	import type { AdguardStats } from '$lib/business/type/adguard-stats';
	import type { ConfigContainer } from '$lib/business/config';
	import ConfigContainerView from '$lib/presentation/components/config-container.svelte';
	import { pollServicesState } from '$lib/presentation/util/poll-services-state';
	import { setAdguardStore } from '$lib/presentation/store/adguard-store.svelte';
	import { setServicesStore } from '$lib/presentation/store/service-store.svelte';

	export type Props = {
		adguard: AdguardStats | null;
		containers: ConfigContainer[];
	};

	let { adguard, containers }: Props = $props();

	const servicesStore = setServicesStore();

	setAdguardStore(() => adguard ?? undefined);

	$effect(() => pollServicesState(servicesStore, containers));
</script>

{#each containers as container, index (index)}
	<ConfigContainerView {container} />
{/each}
