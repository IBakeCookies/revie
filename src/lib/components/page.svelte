<script lang="ts">
	import type { AdguardStats } from '$lib/business/type/adguard-stats';
	import type { ConfigContainer } from '$lib/utils/config';
	import ConfigContainerView from '$lib/components/config-container.svelte';
	import { pollServicesState } from '$lib/utils/poll-services-state';
	import { setAdguardStore } from '$lib/store/adguard-store.svelte';
	import { setServicesStore } from '$lib/store/service-store.svelte';

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
