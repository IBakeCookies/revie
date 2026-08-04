<script lang="ts">
	import type { Props } from '$lib/presentation/components/grid.svelte';
	import Grid from '$lib/presentation/components/grid.svelte';
	import { cn } from '$lib/utils/style';

	let { gridClass, class: className, ...restProps }: Props = $props();
</script>

<!-- A group inside a card, not a second card: Grid's surface, border, shadow and
     blur are all switched off here. With them on, a SubGrid was the same fill, the
     same border and the same shadow as the card it sits in, so nesting read as a
     rendering fault rather than as structure. Nothing to blur once there is no
     surface, hence backdrop-blur-none.
     What carries the grouping instead is the subtitle plus a left rail — Grid's
     border is transparent on every side but that one. The rail is also what keeps
     depth readable: nested groups indent, where two filled cards just stacked. -->
<Grid
	{...restProps}
	class={cn(
		'border-transparent border-l-line-strong bg-transparent p-0 pl-box-md shadow-none backdrop-blur-none',
		className,
	)}
	gridClass={cn('gap-grid-sm', gridClass)}
/>
