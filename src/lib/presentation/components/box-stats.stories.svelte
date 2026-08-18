<script module lang="ts">
	import type { Stat } from '$lib/business/type/stats';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import BoxStats from '$lib/presentation/components/box-stats.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale, overwriteGetLocale } from '$lib/paraglide/runtime';
	import { providerNameLabel } from '$lib/presentation/util/provider-name';

	// Built from the same locale the component reads, so a render in the wrong locale cannot
	// pass by matching a hardcoded string.
	const counts = new Intl.NumberFormat(getLocale());
	const millis = new Intl.NumberFormat(getLocale(), {
		style: 'unit',
		unit: 'millisecond',
		unitDisplay: 'narrow',
	});
	const percent = new Intl.NumberFormat(getLocale(), {
		style: 'percent',
		maximumFractionDigits: 1,
	});

	// Captured before the German story swaps it: the runtime exports no reset, so a story that
	// left `getLocale` on 'de' would render every story after it in German while the three
	// formatters above stay English.
	const originalGetLocale = getLocale;

	const healthy: Stat[] = [
		{
			key: 'dns-queries',
			value: 1234,
		},
		{
			key: 'blocked',
			value: 56,
		},
		{
			key: 'avg-latency',
			value: 12,
		},
		{
			key: 'top-blocked-domain',
			value: 'ads.example.com',
		},
	];

	const { Story } = defineMeta({
		title: 'Components/Box Stats',
		component: BoxStats,
		tags: ['autodocs'],
		args: {
			provider: 'adguard',
			href: 'http://adguard.local',
			span: 6,
			stats: healthy,
		},
	});
</script>

<!-- The whole box is one link to the service's own UI, so the readings sit inside an anchor -->
<Story
	name="Healthy stats"
	play={async ({ args, canvas, canvasElement }) => {
		const link = canvas.getByRole('link');

		// `rel="noreferrer"` is the point of the assertion, not the href: the dashboard
		// URL is an internal address and must not travel to the service.
		await expect(link).toHaveAttribute('href', args.href);
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noreferrer');

		// The provider is a token in config and a product name on screen — the map is
		// presentation's, and the sentence around it is a paraglide message taking it as a
		// parameter. A raw `adguard` reaching the accessible name is the failure to catch.
		await expect(link).toHaveAccessibleName(
			m.stats_open({
				provider: providerNameLabel.adguard,
				host: 'adguard.local',
			}),
		);

		// Labels asserted through `m` rather than a literal, because a hardcoded string here
		// would be a second copy of messages/en.json that nothing keeps in step. The pairing
		// is the claim: a label sitting next to the wrong number is the failure to catch.
		const tiles = [...canvasElement.querySelectorAll('dl > div')];

		await expect(
			tiles.map((tile) => [
				tile.querySelector('dt')?.textContent,
				tile.querySelector('dd')?.textContent,
			]),
		).toEqual([
			[m.stat_dns_queries(), counts.format(1234)],
			[m.stat_blocked(), counts.format(56)],
			[m.stat_avg_latency(), millis.format(12)],
			[m.stat_top_blocked_domain(), 'ads.example.com'],
		]);

		// The card is a translucent surface, so it carries its own backdrop-blur —
		// without it the theme's background image shows through unfrosted. The fill
		// itself comes from whatever the box sits in; a story mounts no card, so it
		// is the fallback here.
		await expect(link).toHaveClass('bg-(--box-surface,var(--surface-card))');
		await expect(link).toHaveClass('backdrop-blur');

		// `--span` must always be emitted: an unset custom property makes `grid-column`
		// invalid at computed-value time and drops the whole declaration.
		await expect(link).toHaveStyle({
			'--span': '6',
		});

		// Each reading is keyed by a semantic border token from tokens.css. A raw palette
		// class (border-red-400) would look right in one theme and wrong in the other 26.
		const accents = ['border-l-success', 'border-l-danger', 'border-l-info', 'border-l-warning'];

		for (const [index, accent] of accents.entries()) {
			await expect(tiles[index]).toHaveClass(accent);
		}

		// A reading sits ON this box, so the box declares the step below itself for
		// them rather than each reading naming a fill it cannot know is right.
		await expect(getComputedStyle(tiles[0]).backgroundColor).toBe(
			getComputedStyle(document.documentElement).getPropertyValue('--surface-inset').trim(),
		);
	}}
/>

<!-- The service is unreachable: business hands the failure back as a value, the store keeps
     no readings, and `stats` arrives undefined through box-stats-wrapper. The box stays and
     says why — a padded empty rectangle reads as a layout bug instead. -->
<Story
	name="Unreachable"
	args={{
		stats: undefined,
	}}
	play={async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelectorAll('p')).toHaveLength(1);

		// The provider names itself here too: on a page of several stats boxes, one line
		// reading "statistics unavailable" says nothing about which one.
		await expect(
			canvas.getByText(
				m.stats_unavailable({
					provider: providerNameLabel.adguard,
				}),
			),
		).toBeInTheDocument();

		// The link is what makes the empty box useful — it is how an operator gets to the
		// service's own UI to find out why the read failed.
		await expect(canvas.getByRole('link')).toBeInTheDocument();
	}}
/>

<!-- A quiet resolver reports zeros, not nothing: every reading is formatted, so a falsy
     count must still render as a zero rather than collapse the tile. -->
<Story
	name="Zero traffic"
	args={{
		stats: [
			{
				key: 'dns-queries',
				value: 0,
			},
			{
				key: 'blocked',
				value: 0,
			},
			{
				key: 'avg-latency',
				value: 0,
			},
			{
				key: 'top-blocked-domain',
				value: '',
			},
		],
	}}
	play={async ({ canvasElement }) => {
		// Read off the `dd`s rather than by text: the two zero counts are the same string,
		// so a text query could not tell a rendered tile from a missing one.
		await expect([...canvasElement.querySelectorAll('dd')].map((dd) => dd.textContent)).toEqual([
			counts.format(0),
			counts.format(0),
			millis.format(0),
			'',
		]);
	}}
/>

<!-- A provider emitting fewer readings than another simply fills fewer cells: the grid is
     driven by the list, not by a hardcoded four, which is what keeps one component
     covering every provider. -->
<Story
	name="Fewer readings"
	args={{
		stats: [
			{
				key: 'dns-queries',
				value: 7,
			},
		],
	}}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelectorAll('dl > div')).toHaveLength(1);
		await expect(canvasElement.querySelector('dd')?.textContent).toBe(counts.format(7));
	}}
/>

<!-- A second provider, and the one thing about its readings that breaks silently: the two
     share-shaped keys carry a FRACTION, because `Intl`'s percent style multiplies by 100
     itself. Pass a wire's own 0-100 through and 75 renders as 7,500% — no error anywhere. -->
<Story
	name="A fraction reads as a percentage"
	args={{
		provider: 'uptime-kuma',
		href: 'http://kuma.local/status/home',
		stats: [
			{
				key: 'monitors-up',
				value: 8,
			},
			{
				key: 'monitors-down',
				value: 1,
			},
			{
				key: 'uptime-24h',
				value: 0.75,
			},
		],
	}}
	play={async ({ canvas, canvasElement }) => {
		await expect([...canvasElement.querySelectorAll('dd')].map((dd) => dd.textContent)).toEqual([
			counts.format(8),
			counts.format(1),
			percent.format(0.75),
		]);

		// The label map is complete over `StatKey`, so a reading a new provider emits and
		// presentation has no words for cannot compile — this is the rendered half of it.
		await expect(canvas.getByText(m.stat_uptime_24h())).toBeInTheDocument();
	}}
/>

<!-- `span` is a token (1-12) mapped to a custom property, never a class name: a class that
     only ever appears in runtime config is never scanned by Tailwind and produces no CSS. -->
<Story
	name="Full width"
	args={{
		span: 12,
	}}
	play={async ({ canvas }) => {
		await expect(canvas.getByRole('link')).toHaveStyle({
			'--span': '12',
		});
	}}
/>

<!-- No span in config: the property still has to be emitted, or the column rule dies -->
<Story
	name="Unset span"
	args={{
		span: undefined,
	}}
	play={async ({ canvas }) => {
		// The VALUE, not just the property: `spanStyle()` falls back to the full
		// twelve, and a smaller default collapses every unset box to a sliver of a
		// row while an assertion that only looks for `--span` stays green.
		await expect(canvas.getByRole('link')).toHaveStyle({
			'--span': '12',
		});
	}}
/>

<!-- The one story that does NOT build its expectation from `m.*()` / `getLocale()`. The others
     follow whatever locale they run in, so they would stay green with de.json deleted and with
     `Intl` handed the wrong locale. The literals are the assertion: 1234 is '1.234' in German
     and '1,234' in English, and `stat_dns_queries` silently compiles to the English string
     whenever de.json is missing the key. -->
<Story
	name="A reading in German"
	beforeEach={() => {
		// The box reads `getLocale()` at mount, for both `m.*()` and its `Intl` formatters, so
		// the locale has to move before the render — `{ locale: 'de' }` on a message cannot
		// reach it, and `setLocale()` would persist a cookie into the shared browser page.
		overwriteGetLocale(() => 'de');

		return () => overwriteGetLocale(originalGetLocale);
	}}
	play={async ({ canvasElement }) => {
		const tile = canvasElement.querySelector('dl > div');

		await expect(tile?.querySelector('dt')?.textContent).toBe('DNS-Anfragen');
		await expect(tile?.querySelector('dd')?.textContent).toBe('1.234');
	}}
/>
