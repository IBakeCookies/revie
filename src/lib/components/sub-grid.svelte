<script lang="ts">
	import type { Props } from '$lib/components/grid.svelte';
	import Grid from '$lib/components/grid.svelte';
	import { cn } from '$lib/utils/style';

	let { gridClass, class: className, ...restProps }: Props = $props();
</script>

<Grid
	{...restProps}
	class={cn('rounded-xs p-box-md', className)}
	gridClass={cn('gap-grid-xs', gridClass)}
/>
