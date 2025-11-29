<script lang="ts">
	import Grid from '$lib/components/grid.svelte';
	import type { Props } from '$lib/components/grid.svelte';

	let { title, subTitle, items, gridClass, class: className, ...restProps }: Props = $props();
</script>

<Grid
	{...restProps}
	{title}
	{subTitle}
	{items}
	class="rounded-xs p-box-md {className}"
	gridClass="gap-grid-xs {gridClass}"
/>
