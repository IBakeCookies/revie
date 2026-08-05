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
     depth readable: nested groups indent, where two filled cards just stacked.
     `self-start` because that rail is the only thing a stretched grid item shows: a
     two-tile group beside a three-tile one drew its rail down through the empty row
     as well, which reads as a rendering fault rather than as an empty group. A filled
     card is the opposite case and still stretches — hence this and not Grid.
     `--box-surface: inherit` for the same reason the surface is off: a group draws
     nothing, so its tiles sit on whatever the group itself sits on. Grid's items
     declare the next step down, which is right under a card and wrong here — it would
     drop a top-level group's tiles a step below a page they are sitting directly on. -->
<Grid
	{...restProps}
	class={cn(
		'border-transparent border-l-line-strong self-start bg-transparent p-0 pl-box-md shadow-none backdrop-blur-none rounded-none',
		className,
	)}
	gridClass={cn('gap-grid-sm [--box-surface:inherit]', gridClass)}
/>
