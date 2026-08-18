<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import BoxStats from '$lib/presentation/components/box-stats.svelte';
	import { getStatsStore } from '$lib/business/store/stats-store.svelte';

	type Props = Omit<ComponentProps<typeof BoxStats>, 'stats'>;

	let props: Props = $props();
	const statsStore = getStatsStore();

	const stats = $derived(statsStore?.stats(props.provider, props.href));
</script>

<BoxStats {...props} {stats} />
