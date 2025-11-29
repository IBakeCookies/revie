<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import BoxService from '$lib/components/box-service.svelte';
	import { getServicesStore } from '$lib/store/service-store.svelte';

	type Props = ComponentProps<typeof BoxService>;

	let props: Props = $props();
	const servicesStore = getServicesStore();

	const currentService = $derived.by(() => {
		return servicesStore.services.find((service) => {
			return service.href === props.href;
		});
	});

	const isOnline = $derived(currentService?.isAlive ?? null);
</script>

<BoxService {...props} {isOnline} />
