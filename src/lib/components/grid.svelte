<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import type { ConfigContainer } from '$lib/utils/config';
	import ConfigContainerView from '$lib/components/config-container.svelte';
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
		'cyber-punk:border p-box-xl col-span-12 xl:col-span-(--span) bg-box-primary rounded solid:border',
		restProps.class
	)}
>
	{#if title}
		<h3 class="text-2xl">{title}</h3>
	{/if}

	{#if subTitle}
		<h5 class="text-lg text-ty-secondary">{subTitle}</h5>
	{/if}

	<div class={cn('grid grid-cols-12 gap-grid-lg mt-ty-headline-md', gridClass)}>
		{#each items as item, index (index)}
			<ConfigContainerView container={item} />
		{/each}
	</div>
</div>
