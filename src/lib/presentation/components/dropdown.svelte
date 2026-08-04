<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn } from '$lib/utils/style';

	export type Props = {
		trigger: Snippet;
		children: Snippet;
		/** Extra panel classes — the theme list needs a scroll cap, the others don't. */
		panelClass?: ClassValue;
		class?: ClassValue;
	} & HTMLAttributes<HTMLDivElement>;

	let { trigger, children, panelClass, ...restProps }: Props = $props();
</script>

<div {...restProps} class={cn('group relative z-1', restProps.class)}>
	<button
		class="bg-surface-card border-line-strong backdrop-blur py-box-xs px-box-lg rounded-md border"
	>
		{@render trigger()}
	</button>

	<div
		class="pt-text-2xs transition-all absolute top-full left-0 invisible opacity-0 group-hover:opacity-100 group-hover:visible"
	>
		<!-- opaque page surface, not the translucent card: the panel floats over
		     arbitrary content and has to stay readable on the glass themes -->
		<div
			class={cn(
				'bg-popover border-line-strong shadow-card size-max rounded-md border',
				panelClass,
			)}
		>
			{@render children()}
		</div>
	</div>
</div>
