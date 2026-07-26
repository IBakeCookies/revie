<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn, spanStyle } from '$lib/utils/style';
	import { getLocale } from '$lib/paraglide/runtime';

	export type Props = {
		span?: number;
		class?: ClassValue;
	} & HTMLAttributes<HTMLDivElement>;

	const formatter = new Intl.DateTimeFormat(getLocale(), {
		weekday: 'short',
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});

	let { span, ...restProps }: Props = $props();
	let currentDate = $state(formatter.format(new Date()));

	$effect(() => {
		const id = setInterval(() => {
			currentDate = formatter.format(new Date());
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
		'col-span-12 xl:col-span-(--span) p-box-md text-xl text-center bg-box-secondary rounded-xs',
		restProps.class
	)}
>
	{currentDate}
</div>
