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
	<!-- Ghost until pointed at, and it rises into the same chip the nav marks its current
	     page with: the trigger sits in a recessed track that already separates it from the
	     bar, so a border and a fill of its own made the two menus the heaviest thing in a
	     header whose job is to stay out of the way. -->
	<!-- `type="button"`: the default is `submit`, which is a live bug the day this sits
	     inside a form. No `aria-expanded` and no `aria-haspopup` on purpose — the panel
	     is opened by `group-hover` / `group-focus-within` and there is no state to
	     report: the attribute could only ever be a constant, and a constant "expanded"
	     is a lie the moment a reader arrows over the trigger without focusing it, while
	     a constant "collapsed" is a lie whenever it is focused. `haspopup` announces
	     menu semantics — arrow-key navigation between the items — which a panel of
	     plain buttons does not implement. Wiring either one honestly means holding the
	     open state in JS, which is the CSS's job here. -->
	<button
		type="button"
		class="hover:bg-surface-card hover:shadow-card focus-visible:ring-ring flex w-full cursor-pointer items-center justify-center gap-text-2xs rounded-full px-box-sm py-box-3xs text-sm transition focus-visible:ring-2 focus-visible:outline-none"
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
