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
				: m.service_status_offline(),
	);

	// Which machine a tile points at is the second thing an operator wants after the
	// name. Guarded, not caught: a hand-edited href with no scheme makes `new URL`
	// throw, normalizeConfig only checks that the prop is a string, and this renders
	// during SSR — so one bad line of config would 500 the whole page. `canParse`
	// rather than the tidier `URL.parse`, because that one landed in node 22.1 and
	// `engines.node` is `>=22`.
	const host = $derived(URL.canParse(href) ? new URL(href).host : href);

	// A dashboard on a LAN reaches the icon CDNs config.example.json points at only
	// if the box has a route out, and a wrong path is a typo away. Either way the
	// browser draws its broken-image glyph, which reads as a rendering fault rather
	// than a missing icon — so fall back to the service's initial.
	//
	// The failure is recorded per src, not as a boolean: containers are keyed by
	// index, so navigating between two pages whose tile N differs reuses this
	// instance, and a plain flag would keep the letter over the next tile's good icon.
	let failedSrc = $state<string | undefined>();
	const hasIcon = $derived(failedSrc !== img.src);
</script>

<a
	{...restProps}
	{href}
	target="_blank"
	rel="noreferrer"
	style={spanStyle(span)}
	class={cn(
		'bg-surface-inset border-line-soft hover:border-line-strong hover:shadow-card focus-visible:ring-ring col-span-12 flex cursor-pointer items-center gap-text-md rounded-lg border p-box-md backdrop-blur transition focus-visible:ring-2 focus-visible:outline-none motion-safe:hover:-translate-y-0.5 xl:col-span-(--span)',
		restProps.class,
	)}
>
	<span
		class="bg-surface-card border-line-soft grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border"
	>
		{#if hasIcon}
			<img
				class="size-6 object-contain"
				src={img.src}
				alt=""
				onerror={() => (failedSrc = img.src)}
			/>
		{:else}
			<span class="text-ty-secondary text-sm font-semibold" aria-hidden="true">
				{title.trim().charAt(0).toUpperCase()}
			</span>
		{/if}
	</span>

	<div class="flex min-w-0 flex-col">
		<h3 class="truncate font-medium">{title}</h3>
		<span class="text-ty-silent truncate text-2xs">{host}</span>
	</div>

	<!-- `role="img"` is what makes the label count: `aria-label` is ignored on an
	     element with no role and no text, so without it the dot's state reached nobody
	     and colour was the only carrier.

	     Unknown is `ty-ghost`, not `primary`: a theme is free to make its accent the
	     same green as `success` — `revie` deliberately does — and then a service whose
	     probe has not answered yet reads as online to everyone not using the label. -->
	<span
		role="img"
		class={[
			'ml-auto size-2.5 shrink-0 rounded-full',
			isOnline === true ? 'bg-success' : isOnline === false ? 'bg-danger' : 'bg-ty-ghost',
		]}
		aria-label={statusLabel}
	>
	</span>
</a>
