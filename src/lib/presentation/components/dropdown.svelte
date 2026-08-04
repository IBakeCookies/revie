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

<!-- The open one is raised: two dropdowns at the same z-index leave the later
     sibling painting over the earlier one's panel, which below `sm` is exactly the
     wide theme list under a half-width trigger. -->
<div {...restProps} class={cn('group relative z-1 hover:z-20 focus-within:z-20', restProps.class)}>
	<button
		class="bg-surface-card border-line-strong hover:bg-surface-hover focus-visible:ring-ring flex w-full cursor-pointer items-center justify-center gap-text-2xs rounded-md border px-box-lg py-box-xs transition-colors focus-visible:ring-2 focus-visible:outline-none sm:w-auto"
	>
		{@render trigger()}
		<!-- The trigger looked like a plain button, so nothing said a menu was behind
		     it until you happened to hover. A glyph rather than an icon dependency. -->
		<span class="text-ty-silent text-2xs" aria-hidden="true">&#9662;</span>
	</button>

	<!-- `group-focus-within` is not decoration: `invisible` makes the panel's buttons
	     unfocusable, so on hover alone a keyboard could reach the trigger and then had
	     no way to open what it triggers. Focusing the trigger now opens the panel. -->
	<div
		class="invisible absolute top-full left-0 pt-text-2xs opacity-0 transition-all group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
	>
		<!-- opaque page surface, not the translucent card: the panel floats over
		     arbitrary content and has to stay readable on the glass themes -->
		<div
			class={cn(
				'bg-popover border-line-strong shadow-card size-max rounded-md border p-text-2xs',
				panelClass,
			)}
		>
			{@render children()}
		</div>
	</div>
</div>
