<script lang="ts">
	import type { AdguardStats } from '$lib/business/type/adguard-stats';
	import type { ConfigContainer } from '$lib/business/model/config';
	import ConfigContainerView from '$lib/presentation/components/config-container.svelte';
	import { pollServicesState } from '$lib/business/store/poll-services-state';
	import { setAdguardStore } from '$lib/business/store/adguard-store.svelte';
	import { setServicesStore } from '$lib/business/store/service-store.svelte';

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
