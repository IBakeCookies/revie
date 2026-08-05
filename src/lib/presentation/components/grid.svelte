<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import type { ConfigContainer } from '$lib/business/model/config';
	import ConfigContainerView from '$lib/presentation/components/config-container.svelte';
	import { cn, spanStyle } from '$lib/utils/style';

	export type Props = {
		title?: string;
		subTitle?: string;
		items: ConfigContainer[];
		span?: number;
		gridClass?: ClassValue;
		class?: ClassValue;
	} & HTMLAttributes<HTMLDivElement>;

	let { title, subTitle, items, span, gridClass, ...restProps }: Props = $props();
</script>

<div
	{...restProps}
	style={spanStyle(span)}
	class={cn(
		'@container/grid bg-(--box-surface,var(--surface-card)) border-line-strong shadow-card col-span-12 rounded-2xl border p-box-xl backdrop-blur xl:col-span-(--span)',
		restProps.class,
	)}
>
	<!-- The gap below the headings belongs to the headings, not to the items grid: a
	     grid the config gave neither a title nor a subtitle used to carry the margin
	     anyway and started with a blank strip.

	     A titled card also gets a rule under the heading, and only a titled one: the rule
	     is what makes the title read as the card's header rather than as its first row of
	     content. A SubGrid passes only `subTitle`, so a group label keeps sitting straight
	     on its boxes — a hairline there would draw a second rail across the first. -->
	{#if title || subTitle}
		<div
			class={cn(
				'mb-text-md flex flex-col gap-text-3xs',
				title && 'border-line-soft border-b pb-text-sm',
			)}
		>
			{#if title}
				<!-- h2, not h3: the layout's app title is the page's only h1, so a card
				     titled h3 skipped a level on every real page. The storybook a11y gate
				     cannot see that one — no story mounts the layout, so h3 was the
				     story's first heading and passed. The size is a class, so the visual
				     step is unchanged. Container-queried, not viewport-queried: the same card
				     is the whole page here and a third of a row there. -->
				<h2 class="text-xl font-semibold tracking-tight @2xl/grid:text-2xl">{title}</h2>
			{/if}

			{#if subTitle}
				<!-- h3, which is also what a BoxService title is: a repeat of a level is
				     not a skip, so a group label above its boxes passes either way. Set as
				     a section label rather than a smaller title — it is what carries the
				     grouping now that SubGrid draws no surface of its own. `ty-secondary`
				     and not `ty-silent` for that reason: an 11px uppercase label doing the
				     page's structural work was also the quietest text on it. -->
				<h3 class="text-ty-secondary text-xs font-semibold tracking-wider uppercase">
					{subTitle}
				</h3>
			{/if}
		</div>
	{/if}

	<!-- The card is what its items sit ON, so it names the fill one step down for
	     everything inside it — `--box-surface`, read back by every box through
	     `bg-(--box-surface,var(--surface-card))`. Depth is the container's to
	     declare because a box cannot know its own: the same BoxService is a tile in
	     this card on one page and sits straight on the page on another, and a fixed
	     fill is wrong in one of the two. The declaration is on THIS element and not
	     on the card above, because the card reads the variable itself — a custom
	     property applies to the element that declares it, so a card that both
	     declared and read it would hand itself its own children's fill. -->
	<div class={cn('grid grid-cols-12 gap-grid-lg [--box-surface:var(--surface-inset)]', gridClass)}>
		{#each items as item, index (index)}
			<ConfigContainerView container={item} />
		{/each}
	</div>
</div>
