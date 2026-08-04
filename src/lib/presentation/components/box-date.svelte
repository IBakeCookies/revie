<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn, spanStyle } from '$lib/utils/style';
	import { getLocale } from '$lib/paraglide/runtime';

	export type Props = {
		span?: number;
		class?: ClassValue;
	} & HTMLAttributes<HTMLDivElement>;

	let { span, ...restProps }: Props = $props();

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
	{...restProps}
	style={spanStyle(span)}
	class={cn(
		'bg-surface-inset border-line-soft col-span-12 flex flex-col items-center gap-text-3xs rounded-lg border px-box-lg py-box-md backdrop-blur xl:col-span-(--span)',
		restProps.class,
	)}
>
	<span class="text-ty-silent text-2xs tracking-wider uppercase">{dateFormatter.format(now)}</span>

	<!-- `tabular-nums` so the seconds do not shift the line's width once a second,
	     which is what a proportional font does to a running clock. -->
	<time class="text-3xl font-semibold tabular-nums" datetime={now.toISOString()}>
		{timeFormatter.format(now)}
	</time>
</div>
