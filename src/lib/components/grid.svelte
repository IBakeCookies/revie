<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import type { TransformConfigOutput } from '$lib/utils/config';
	import { cn } from '$lib/utils/style';

	export type Props = {
		title?: string;
		subTitle?: string;
		items: TransformConfigOutput[];
		gridClass?: ClassValue;
		class?: ClassValue;
	} & HTMLAttributes<any>;

	let { title, subTitle, items, gridClass, ...restProps }: Props = $props();
</script>

<div
	{...restProps}
	class={cn(
		'cyber-punk:border p-box-xl col-span-12 bg-box-primary rounded solid:border',
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
		{#each items as item}
			{@const Component = item.component as any}

			{#if Component}
				<Component {...item.props} />
			{:else}
				<p class="text-xl font-bold text-danger">Unknown component: {item.name}</p>
			{/if}
		{/each}
	</div>
</div>
