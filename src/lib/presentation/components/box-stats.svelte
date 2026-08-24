<script lang="ts">
	import type { ClassValue } from 'clsx';
	import type { NumericStatKey, Stat, StatKey } from '$lib/business/type/stats';
	import type { ProviderName } from '$lib/business/model/config';
	import { cn, spanStyle } from '$lib/utils/style';
	import { isTextStat } from '$lib/business/type/stats';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { providerNameLabel } from '$lib/presentation/util/provider-name';

	/**
	 * Every prop this box takes, and nothing else — deliberately WITHOUT
	 * `& HTMLAnchorAttributes` and without a `{...restProps}` pass-through. It was the
	 * first box with neither; roadmap #22 took them off the rest.
	 *
	 * That absence is the whole guard: `config-container.svelte` spreads config's own props
	 * in here, `secret` among them, and a rest spread would put the NAME of an environment
	 * variable on the anchor as a DOM attribute, published to every visitor. A prop this
	 * type does not name is simply never read, so nothing has to be declared in order to
	 * swallow it — `secret` used to be, which bought a `no-unused-props` disable and a story
	 * whose only job was to keep the declaration alive. The e2e asserts the anchor.
	 */
	export type Props = {
		/** Which service this box reads. Config picks it; only the words come from here. */
		provider: ProviderName;
		/** Base URL of the instance. Credentials are resolved server-side. */
		href: string;
		stats?: Stat[];
		span?: number;
		class?: ClassValue;
	};

	let { provider, href, stats, span, class: className }: Props = $props();

	// Instance scope, not module scope, for the same reason as box-date's formatter:
	// the module body runs once per node process while the locale is per request.
	// The unit style carries the `ms` so no message has to spell it.
	const counts = new Intl.NumberFormat(getLocale());
	const millis = new Intl.NumberFormat(getLocale(), {
		style: 'unit',
		unit: 'millisecond',
		unitDisplay: 'narrow',
	});
	// Takes a FRACTION and multiplies by 100 itself, which is why the two keys it formats
	// are fractions and both projections that emit one divide. One decimal, because a block
	// rate rounded to whole percent stops moving for hours.
	const percent = new Intl.NumberFormat(getLocale(), {
		style: 'percent',
		maximumFractionDigits: 1,
	});
	// One decimal, because a reading rounded to whole degrees hides exactly the change the
	// box exists to show. Deliberately NO unit style: the unit is whatever the operator
	// pinned into the href (`temperature_unit=fahrenheit`, `wind_speed_unit=ms`), so a
	// hardcoded °C or km/h would lie about the number beside it.
	const decimal = new Intl.NumberFormat(getLocale(), {
		maximumFractionDigits: 1,
	});

	/** Complete over the numeric keys alone, so there is no entry for a reading that is a name. */
	const formats: Record<NumericStatKey, Intl.NumberFormat> = {
		'dns-queries': counts,
		blocked: counts,
		'avg-latency': millis,
		'blocked-share': percent,
		'blocklist-domains': counts,
		'monitors-up': counts,
		'monitors-down': counts,
		'uptime-24h': percent,
		'guests-running': counts,
		'guests-stopped': counts,
		'cpu-share': percent,
		'memory-share': percent,
		temperature: decimal,
		'apparent-temperature': decimal,
		humidity: percent,
		'wind-speed': decimal,
		precipitation: decimal,
	};

	// Which instance this box points at. A page may hold several, so without this two
	// boxes announce the same accessible name and a screen reader listing links cannot
	// tell them apart. Axe cannot catch it either: identical-links-same-purpose is off by
	// default. Guarded, not caught, and `canParse` for the two reasons box-service states.
	const host = $derived(URL.canParse(href) ? new URL(href).host : href);

	const readings = $derived.by(() => {
		// `$derived` is lazy and `readings` is only ever read under the template's
		// `{#if stats}`, so this never evaluates without stats.
		//
		// The labels are inside the derived and the formatters outside it: `m.*()` follows
		// the locale, `Intl` is built once per instance. A key business can emit and
		// presentation has no words for is a compile error here — the same guarantee
		// `config-container.svelte`'s `never` gives the container names.
		const chrome: Record<StatKey, { label: string; accent: string }> = {
			'dns-queries': {
				label: m.stat_dns_queries(),
				accent: 'border-l-success',
			},
			blocked: {
				label: m.stat_blocked(),
				accent: 'border-l-danger',
			},
			'avg-latency': {
				label: m.stat_avg_latency(),
				accent: 'border-l-info',
			},
			'top-blocked-domain': {
				label: m.stat_top_blocked_domain(),
				accent: 'border-l-warning',
			},
			'blocked-share': {
				label: m.stat_blocked_share(),
				accent: 'border-l-danger',
			},
			'blocklist-domains': {
				label: m.stat_blocklist_domains(),
				accent: 'border-l-info',
			},
			'monitors-up': {
				label: m.stat_monitors_up(),
				accent: 'border-l-success',
			},
			'monitors-down': {
				label: m.stat_monitors_down(),
				accent: 'border-l-danger',
			},
			'uptime-24h': {
				label: m.stat_uptime_24h(),
				accent: 'border-l-info',
			},
			'guests-running': {
				label: m.stat_guests_running(),
				accent: 'border-l-success',
			},
			'guests-stopped': {
				label: m.stat_guests_stopped(),
				accent: 'border-l-danger',
			},
			'cpu-share': {
				label: m.stat_cpu_share(),
				accent: 'border-l-info',
			},
			'memory-share': {
				label: m.stat_memory_share(),
				accent: 'border-l-info',
			},
			// Weather is a fact, not a state — there is no good/bad axis for an accent to
			// carry, so every reading takes the neutral edge the load readings use.
			temperature: {
				label: m.stat_temperature(),
				accent: 'border-l-info',
			},
			'apparent-temperature': {
				label: m.stat_apparent_temperature(),
				accent: 'border-l-info',
			},
			humidity: {
				label: m.stat_humidity(),
				accent: 'border-l-info',
			},
			'wind-speed': {
				label: m.stat_wind_speed(),
				accent: 'border-l-info',
			},
			precipitation: {
				label: m.stat_precipitation(),
				accent: 'border-l-info',
			},
		};

		// `wide` is DERIVED rather than a field on the reading, because the comment that
		// justified the field already said what it means — "the one value that is not a
		// number". It takes the row to itself and a smaller size: at the size the counts are
		// set it would truncate to three characters in a narrow tile, which is why it stops
		// being wide once the box passes @3xl and a quarter of it is ~13rem, enough for a
		// domain at text-base. The cutover is @3xl and not @4xl because the box is 8 of 12
		// columns in the hero row, which lands at ~868px inner: under @4xl, so the domain
		// took a second row to itself and left the row of three above it with a plinth.
		return (stats ?? []).map((stat) => ({
			...chrome[stat.key],
			wide: isTextStat(stat),
			value: isTextStat(stat) ? stat.value : formats[stat.key].format(stat.value),
		}));
	});
</script>

<!-- The label is unconditional: without it the accessible name is whatever the box happens
     to contain — the readings run together, or the one unavailable line. The link is how
     an operator reaches the service's own UI to find out why it is unreachable, so it has
     to announce that in both states. -->
<!-- `flex justify-center` rather than `block`: this box shares a row with the clock and
     stretches to it, so the one-line unavailable state used to sit pinned to the top of a
     tall rectangle and read as a box that had failed to render. Centred, it reads as a
     state. With stats the `dl` fills the box, so it is a no-op there. -->
<a
	{href}
	target="_blank"
	rel="noreferrer"
	aria-label={m.stats_open({
		provider: providerNameLabel[provider],
		host,
	})}
	style={spanStyle(span)}
	class={cn(
		'@container/box-stats bg-(--box-surface,var(--surface-card)) border-line-soft hover:border-line-strong focus-visible:ring-ring col-span-12 flex flex-col justify-center rounded-2xl border p-box-lg backdrop-blur transition focus-visible:ring-2 focus-visible:outline-none xl:col-span-(--span)',
		className,
	)}
>
	{#if stats}
		<!-- A label/value pair per reading, so the number is the thing that carries: the
		     readings used to be full sentences, which is prose in a box rather than a
		     dashboard. The accent edge keys each one to its meaning. -->
		<!-- Same `--box-surface` step Grid declares for its items: the readings sit on this
		     box, so their fill is one below whatever this box turned out to be. On the page
		     that is card → inset; nested in a Grid card it is inset → inset, which is as far
		     as the ladder goes and still reads, because the dark themes' inset is a
		     translucent veil that composites a step lighter over itself. -->
		<dl
			class="grid grid-cols-2 gap-grid-xs [--box-surface:var(--surface-inset)] @2xl/box-stats:grid-cols-3 @3xl/box-stats:grid-cols-4"
		>
			<!-- Keyed by index, not by the label: the labels are translated, so two locales
			     colliding on one would be an `each_key_duplicate` for nothing — the list is
			     short and rebuilt whole above. -->
			{#each readings as reading, index (index)}
				<div
					class={[
						'flex min-w-0 flex-col gap-text-3xs rounded-lg border-l-2 bg-(--box-surface,var(--surface-card)) p-box-sm',
						reading.accent,
						reading.wide && 'col-span-2 @2xl/box-stats:col-span-3 @3xl/box-stats:col-span-1',
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
		     layout bug rather than as an unreachable service.

		     No surface of its own, unlike a reading: this line IS the box's whole content,
		     so a plate around it drew a second rectangle inside the first with a margin of
		     nothing between them — most visible on the opaque light themes, where the two
		     fills are a step apart and the outer one then reads as a frame with a hole in
		     it. The dot carries the state and the box's own border carries the edge. -->
		<p class="text-ty-secondary flex items-center justify-center gap-text-xs">
			<span class="bg-danger size-2 shrink-0 rounded-full" aria-hidden="true"></span>
			{m.stats_unavailable({
				provider: providerNameLabel[provider],
			})}
		</p>
	{/if}
</a>
