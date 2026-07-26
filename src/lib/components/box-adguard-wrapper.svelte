<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import BoxAdguard from '$lib/components/box-adguard.svelte';
	import { getAdguardStore } from '$lib/store/adguard-store.svelte';

	type Props = Omit<ComponentProps<typeof BoxAdguard>, 'stats'>;

	let props: Props = $props();
	const adguardStore = getAdguardStore();

	const stats = $derived(adguardStore?.stats);
</script>

<BoxAdguard {...props} {stats} />
