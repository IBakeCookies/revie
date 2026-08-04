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
		'bg-surface-card border-line-strong shadow-card col-span-12 rounded-2xl border p-box-xl backdrop-blur xl:col-span-(--span)',
		restProps.class,
	)}
>
	<!-- The gap below the headings belongs to the headings, not to the items grid: a
	     grid the config gave neither a title nor a subtitle used to carry the margin
	     anyway and started with a blank strip. -->
	{#if title || subTitle}
		<div class="mb-text-md flex flex-col gap-text-3xs">
			{#if title}
				<!-- h2, not h3: the layout's app title is the page's only h1, so a card
				     titled h3 skipped a level on every real page. The storybook a11y gate
				     cannot see that one — no story mounts the layout, so h3 was the
				     story's first heading and passed. The size is a class, so the visual
				     step is unchanged. -->
				<h2 class="text-xl font-semibold tracking-tight">{title}</h2>
			{/if}

			{#if subTitle}
				<!-- h3, which is also what a BoxService title is: a repeat of a level is
				     not a skip, so a group label above its boxes passes either way. Set as
				     a section label rather than a smaller title — it is what carries the
				     grouping now that SubGrid draws no surface of its own. -->
				<h3 class="text-ty-silent text-2xs font-semibold tracking-wider uppercase">{subTitle}</h3>
			{/if}
		</div>
	{/if}

	<div class={cn('grid grid-cols-12 gap-grid-lg', gridClass)}>
		{#each items as item, index (index)}
			<ConfigContainerView container={item} />
		{/each}
	</div>
</div>
