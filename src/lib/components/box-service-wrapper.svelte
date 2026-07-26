<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import BoxService from '$lib/components/box-service.svelte';
	import { getServicesStore } from '$lib/store/service-store.svelte';

	type Props = Omit<ComponentProps<typeof BoxService>, 'isOnline'>;

	let props: Props = $props();
	const servicesStore = getServicesStore();

	const isOnline = $derived(servicesStore.isAlive(props.href));
</script>

<BoxService {...props} {isOnline} />
