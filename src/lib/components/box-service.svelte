<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn, spanStyle } from '$lib/utils/style';
	import { m } from '$lib/paraglide/messages';

	export type Props = {
		title: string;
		href: string;
		img: {
			src: string;
		};
		isOnline?: boolean | null;
		span?: number;
		class?: ClassValue;
	} & HTMLAnchorAttributes;

	let { isOnline = null, title, href, img, span, ...restProps }: Props = $props();

	const statusLabel = $derived(
		isOnline === null
			? m.service_status_unknown()
			: isOnline
				? m.service_status_online()
				: m.service_status_offline()
	);
</script>

<a
	{...restProps}
	{href}
	target="_blank"
	rel="noreferrer"
	style={spanStyle(span)}
	class={cn(
		'@container/box-service bg-surface-inset backdrop-blur border border-transparent cursor-pointer rounded-md p-box-md relative hover:border-line-strong transition-colors col-span-12 xl:col-span-(--span)',
		restProps.class
	)}
>
	<div
		class="gap-text-2xs @2xs/box-service:gap-text-md flex flex-col @2xs/box-service:flex-row items-center"
	>
		<img class="object-contain min-w-10 size-10" src={img.src} alt="" />

		<h3>{title}</h3>

		<span
			class={[
				'absolute top-4 right-4 ml-auto p-1 rounded-full',
				isOnline === true ? 'bg-success' : isOnline === false ? 'bg-danger' : 'bg-primary'
			]}
			aria-label={statusLabel}
		>
		</span>
	</div>
</a>
