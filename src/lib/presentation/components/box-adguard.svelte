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
		// `$derived` is lazy and `readings` is only ever read under the template's
		// `{#if stats}`, so this never evaluates without stats — the guard that used to
		// stand here was unreachable, and only the compiler needs telling.
		const known = stats!;

		// `wide` is the domain reading, and the only thing that differs about it: it is
		// the one value that is not a number, so it takes the row to itself and a
		// smaller size. At the size the counts are set it would truncate to three
		// characters in a narrow tile — which is why it stops being wide once the box
		// passes @3xl and a quarter of it is ~13rem, enough for a domain at text-base.
		// The cutover is @3xl and not @4xl because the box is 8 of 12 columns in the
		// hero row, which lands at ~868px inner: under @4xl, so the domain took a
		// second row to itself and left the row of three above it with a plinth.
		return [
			{
				label: m.adguard_dns_queries(),
				value: counts.format(known.dnsQueries),
				accent: 'border-l-success',
				wide: false,
			},
			{
				label: m.adguard_blocked(),
				value: counts.format(known.numBlockedFiltering),
				accent: 'border-l-danger',
				wide: false,
			},
			{
				label: m.adguard_delay(),
				value: millis.format(known.avgProcessingTimeMs),
				accent: 'border-l-info',
				wide: false,
			},
			{
				label: m.adguard_top_blocked_domain(),
				value: known.topBlockedDomain,
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
<!-- `flex justify-center` rather than `block`: this box shares a row with the clock and
     stretches to it, so the one-line unavailable state used to sit pinned to the top of a
     tall rectangle and read as a box that had failed to render. Centred, it reads as a
     state. With stats the `dl` fills the box, so it is a no-op there. -->
<a
	{...restProps}
	{href}
	target="_blank"
	rel="noreferrer"
	aria-label={m.adguard_open()}
	style={spanStyle(span)}
	class={cn(
		'@container/box-adguard bg-(--box-surface,var(--surface-card)) border-line-soft hover:border-line-strong focus-visible:ring-ring col-span-12 flex flex-col justify-center rounded-2xl border p-box-lg backdrop-blur transition focus-visible:ring-2 focus-visible:outline-none xl:col-span-(--span)',
		restProps.class,
	)}
>
	{#if stats}
		<!-- A label/value pair per reading, so the number is the thing that carries: the
		     readings used to be four full sentences, which is prose in a box rather than a
		     dashboard. The accent edge keys each one to its meaning. -->
		<!-- Same `--box-surface` step Grid declares for its items: the readings sit on this
		     box, so their fill is one below whatever this box turned out to be. On the page
		     that is card → inset; nested in a Grid card it is inset → inset, which is as far
		     as the ladder goes and still reads, because the dark themes' inset is a
		     translucent veil that composites a step lighter over itself. -->
		<dl
			class="grid grid-cols-2 gap-grid-xs [--box-surface:var(--surface-inset)] @2xl/box-adguard:grid-cols-3 @3xl/box-adguard:grid-cols-4"
		>
			<!-- Keyed by index, not by the label: the labels are translated, so two locales
			     colliding on one would be an `each_key_duplicate` for nothing — the list is
			     four entries long and rebuilt whole above. -->
			{#each readings as reading, index (index)}
				<div
					class={[
						'flex min-w-0 flex-col gap-text-3xs rounded-lg border-l-2 bg-(--box-surface,var(--surface-card)) p-box-sm',
						reading.accent,
						reading.wide && 'col-span-2 @2xl/box-adguard:col-span-3 @3xl/box-adguard:col-span-1',
					]}
				>
					<dt class="text-ty-silent truncate text-2xs tracking-wider uppercase">{reading.label}</dt>
					<dd
						class={[
							'truncate font-semibold tracking-tight',
							reading.wide ? 'text-base' : 'text-2xl tabular-nums',
						]}
					>
						{reading.value}
					</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<!-- Without this the box was a padded rectangle with nothing in it, which reads as a
		     layout bug rather than as an unreachable AdGuard.

		     No surface of its own, unlike a reading: this line IS the box's whole content,
		     so a plate around it drew a second rectangle inside the first with a margin of
		     nothing between them — most visible on the opaque light themes, where the two
		     fills are a step apart and the outer one then reads as a frame with a hole in
		     it. The dot carries the state and the box's own border carries the edge. -->
		<p class="text-ty-secondary flex items-center justify-center gap-text-xs">
			<span class="bg-danger size-2 shrink-0 rounded-full" aria-hidden="true"></span>
			{m.adguard_unavailable()}
		</p>
	{/if}
</a>
