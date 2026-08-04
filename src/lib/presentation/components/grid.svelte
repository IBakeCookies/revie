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
		'p-box-xl col-span-12 xl:col-span-(--span) bg-surface-card border-line-strong shadow-card backdrop-blur rounded-2xl border',
		restProps.class,
	)}
>
	{#if title}
		<h3 class="text-2xl">{title}</h3>
	{/if}

	{#if subTitle}
		<!-- h4, not h5: skipping a level is a heading-order violation. The size is a
		     class, so the visual step is unchanged. -->
		<h4 class="text-lg text-ty-secondary">{subTitle}</h4>
	{/if}

	<div class={cn('grid grid-cols-12 gap-grid-lg mt-text-md', gridClass)}>
		{#each items as item, index (index)}
			<ConfigContainerView container={item} />
		{/each}
	</div>
</div>
