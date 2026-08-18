<script lang="ts">
	import type { ClassValue } from 'clsx';
	import { cn, spanStyle } from '$lib/utils/style';
	import { getLocale } from '$lib/paraglide/runtime';

	export type Props = {
		span?: number;
		class?: ClassValue;
	};

	let { span, class: className }: Props = $props();

	// Instance scope, not module scope: the module body runs once per node
	// process while the locale is per request, so a module-level formatter
	// freezes every SSR response to the first visitor's locale.
	//
	// Two formatters, not one: the clock is the reading and the date is its
	// caption, so they are set at different sizes and cannot come from one string.
	const dateFormatter = new Intl.DateTimeFormat(getLocale(), {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	});
	const timeFormatter = new Intl.DateTimeFormat(getLocale(), {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});

	let now = $state(new Date());

	$effect(() => {
		const id = setInterval(() => {
			now = new Date();
		}, 1000);

		return () => {
			clearInterval(id);
		};
	});
</script>

<div
	style={spanStyle(span)}
	class={cn(
		'@container/box-date bg-(--box-surface,var(--surface-card)) border-line-soft col-span-12 flex flex-col justify-center rounded-2xl border p-box-lg backdrop-blur xl:col-span-(--span)',
		className,
	)}
>
	<!-- Stacked while the box is narrow, one line once it is wide: a config that gives
	     this no span makes it the full 12 columns, where a centred two-line stack was
	     ~200px of content in a 1300px box and spent a whole page row on it. The row is
	     REVERSED so the clock — the reading — lands at the start and its caption at the
	     far end, without reordering the DOM the stacked layout reads top-down.

	     Its own element, and not the box's classes, because a container-type element is
	     a container for its DESCENDANTS: `@2xl/box-date:` on the box itself matches
	     nothing at any width. -->
	<div
		class="flex flex-col items-center gap-text-3xs @2xl/box-date:flex-row-reverse @2xl/box-date:items-baseline @2xl/box-date:justify-between @2xl/box-date:gap-text-md"
	>
		<span class="text-ty-silent text-2xs tracking-wider uppercase">
			{dateFormatter.format(now)}
		</span>

		<!-- `tabular-nums` so the seconds do not shift the line's width once a second,
		     which is what a proportional font does to a running clock. Sized up and
		     tightened: this is the one reading on the page with no rival for the eye,
		     and at text-3xl it was the same weight as a card title. -->
		<time
			class="text-4xl font-semibold tracking-tight tabular-nums @lg/box-date:text-5xl"
			datetime={now.toISOString()}
		>
			{timeFormatter.format(now)}
		</time>
	</div>
</div>
