<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import BoxService from '$lib/presentation/components/box-service.svelte';
	import { getServicesStore } from '$lib/business/store/service-store.svelte';

	type Props = Omit<ComponentProps<typeof BoxService>, 'isOnline'>;

	let props: Props = $props();
	const servicesStore = getServicesStore();

	// `?.`, like box-adguard-wrapper: `getServicesStore` returns `T | undefined` because
	// `getContext` answers `undefined` wherever no page component set the store — which a
	// story mounting this wrapper alone is.
	const isOnline = $derived(servicesStore?.isAlive(props.href));
</script>

<BoxService {...props} {isOnline} />
