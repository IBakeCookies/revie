<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import type { AdguardStats } from '$lib/business/type/adguard-stats';
	import { cn, spanStyle } from '$lib/utils/style';
	import { m } from '$lib/paraglide/messages';

	export type Props = {
		/** Base URL of the AdGuard Home instance. Credentials come from the environment. */
		href: string;
		stats?: AdguardStats;
		span?: number;
		class?: ClassValue;
	} & HTMLAnchorAttributes;

	let { href, stats, span, ...restProps }: Props = $props();

	const items = $derived.by(() => {
		if (!stats) {
			return [];
		}

		return [
			{
				text: m.adguard_dns_queries({
					count: stats.dnsQueries,
				}),
				class: 'border-success',
			},
			{
				text: m.adguard_blocked({
					count: stats.numBlockedFiltering,
				}),
				class: 'border-danger',
			},
			{
				text: m.adguard_delay({
					milliseconds: stats.avgProcessingTimeMs,
				}),
				class: 'border-info',
			},
			{
				text: m.adguard_top_blocked_domain({
					domain: stats.topBlockedDomain,
				}),
				class: 'border-warning',
			},
		];
	});
</script>

<!-- The label is unconditional, and it has to be: with no `stats` this anchor has no text
     at all, so it sat in the tab order announcing nothing — in exactly the state an
     operator needs it, since the link is how they reach the admin UI to find out why
     AdGuard is unreachable. It also fixes the populated case, where the accessible name
     was otherwise all four readings run together. -->
<a
	{...restProps}
	{href}
	target="_blank"
	rel="noreferrer"
	aria-label={m.adguard_open()}
	style={spanStyle(span)}
	class={cn(
		'@container/box-adguard col-span-12 xl:col-span-(--span) block rounded-md bg-surface-inset backdrop-blur p-box-md border border-transparent hover:border-line-strong transition-colors',
		restProps.class,
	)}
>
	<div class="grid gap-grid-xs grid-cols-1 @2xl:grid-cols-2">
		{#each items as item (item.text)}
			<p
				class={['@2xl/box-adguard:p-box-md bg-surface-card p-box-xs rounded-md border', item.class]}
			>
				{item.text}
			</p>
		{/each}
	</div>
</a>
