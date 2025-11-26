<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import BoxService from '$lib/components/box-service.svelte';
	import { boxServiceStore } from '$lib/store/service-state-store.svelte';

	type Props = ComponentProps<typeof BoxService>;

	let props: Props = $props();

	const currentService = $derived.by(() =>
		boxServiceStore.find((service) => {
			return service.href === props.href;
		})
	);

	const isOnline = $derived(currentService?.isAlive ?? null);
</script>

<BoxService {...props} {isOnline} />
