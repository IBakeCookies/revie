<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import BoxAdguard from '$lib/presentation/components/box-adguard.svelte';
	import { getAdguardStore } from '$lib/presentation/store/adguard-store.svelte';

	type Props = Omit<ComponentProps<typeof BoxAdguard>, 'stats'>;

	let props: Props = $props();
	const adguardStore = getAdguardStore();

	const stats = $derived(adguardStore?.stats);
</script>

<BoxAdguard {...props} {stats} />
