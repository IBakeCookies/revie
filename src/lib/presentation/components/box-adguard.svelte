<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import type { AdguardStats } from '$lib/business/type/adguard-stats';
	import { cn, spanStyle } from '$lib/utils/style';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	export type Props = {
		/** Base URL of the AdGuard Home instance. Credentials come from the environment. */
		href: string;
		stats?: AdguardStats;
		span?: number;
		class?: ClassValue;
	} & HTMLAnchorAttributes;

	let { href, stats, span, ...restProps }: Props = $props();

	// Instance scope, not module scope, for the same reason as box-date's formatter:
	// the module body runs once per node process while the locale is per request.
	// The unit style carries the `ms` so no message has to spell it.
	const counts = new Intl.NumberFormat(getLocale());
	const millis = new Intl.NumberFormat(getLocale(), {
		style: 'unit',
		unit: 'millisecond',
		unitDisplay: 'narrow',
	});

	const readings = $derived.by(() => {
		if (!stats) {
			return [];
		}

		// `wide` is the domain reading, and the only thing that differs about it: it is
		// the one value that is not a number, so it takes the row to itself and a
		// smaller size. At the size the counts are set it would truncate to three
		// characters in a quarter-width tile.
		return [
			{
				label: m.adguard_dns_queries(),
				value: counts.format(stats.dnsQueries),
				accent: 'border-l-success',
				wide: false,
			},
			{
				label: m.adguard_blocked(),
				value: counts.format(stats.numBlockedFiltering),
				accent: 'border-l-danger',
				wide: false,
			},
			{
				label: m.adguard_delay(),
				value: millis.format(stats.avgProcessingTimeMs),
				accent: 'border-l-info',
				wide: false,
			},
			{
				label: m.adguard_top_blocked_domain(),
				value: stats.topBlockedDomain,
				accent: 'border-l-warning',
				wide: true,
			},
		];
	});
</script>

<!-- The label is unconditional: without it the accessible name is whatever the box happens
     to contain — all four readings run together, or the one unavailable line. The link is
     how an operator reaches the admin UI to find out why AdGuard is unreachable, so it has
     to announce that in both states. -->
<a
	{...restProps}
	{href}
	target="_blank"
	rel="noreferrer"
	aria-label={m.adguard_open()}
	style={spanStyle(span)}
	class={cn(
		'@container/box-adguard bg-surface-inset border-line-soft hover:border-line-strong focus-visible:ring-ring col-span-12 block rounded-lg border p-box-md backdrop-blur transition focus-visible:ring-2 focus-visible:outline-none xl:col-span-(--span)',
		restProps.class,
	)}
>
	{#if stats}
		<!-- A label/value pair per reading, so the number is the thing that carries: the
		     readings used to be four full sentences, which is prose in a box rather than a
		     dashboard. The accent edge keys each one to its meaning. -->
		<dl class="grid grid-cols-2 gap-grid-xs @2xl/box-adguard:grid-cols-3">
			{#each readings as reading (reading.label)}
				<div
					class={[
						'bg-surface-card flex min-w-0 flex-col gap-text-3xs rounded-md border-l-2 p-box-sm',
						reading.accent,
						reading.wide && 'col-span-2 @2xl/box-adguard:col-span-3',
					]}
				>
					<dt class="text-ty-silent truncate text-2xs tracking-wider uppercase">{reading.label}</dt>
					<dd
						class={['truncate font-semibold', reading.wide ? 'text-base' : 'text-xl tabular-nums']}
					>
						{reading.value}
					</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<!-- Without this the box was a padded rectangle with nothing in it, which reads as a
		     layout bug rather than as an unreachable AdGuard. -->
		<p
			class="bg-surface-card border-danger text-ty-secondary flex items-center justify-center gap-text-xs rounded-md border px-box-md py-box-lg"
		>
			<span class="bg-danger size-2 shrink-0 rounded-full" aria-hidden="true"></span>
			{m.adguard_unavailable()}
		</p>
	{/if}
</a>
