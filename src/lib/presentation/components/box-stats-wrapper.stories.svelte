<script module lang="ts">
	import type { Stat } from '$lib/business/type/stats';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import BoxStatsWrapper from '$lib/presentation/components/box-stats-wrapper.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { providerNameLabel } from '$lib/presentation/util/provider-name';
	import { statsKey } from '$lib/business/model/config';

	// Built from the same locale the box reads, so a render in the wrong locale cannot pass
	// by matching a hardcoded string.
	const counts = new Intl.NumberFormat(getLocale());

	const HREF = 'http://adguard.local';
	const SECOND_HREF = 'http://adguard.other';

	const healthy: Stat[] = [
		{
			key: 'dns-queries',
			value: 1234,
		},
		{
			key: 'top-blocked-domain',
			value: 'ads.example.com',
		},
	];

	const second: Stat[] = [
		{
			key: 'dns-queries',
			value: 99,
		},
		{
			key: 'top-blocked-domain',
			value: 'trackers.example.com',
		},
	];

	const { Story } = defineMeta({
		title: 'Components/Box Stats Wrapper',
		component: BoxStatsWrapper,
		tags: ['autodocs'],
		args: {
			provider: 'adguard',
			href: HREF,
			span: 6,
		},
	});
</script>

<script lang="ts">
	import StatsStoreHarness from '$lib/test/stats-store-harness.svelte';

	/* Only the last story reads this. Each story mounts its OWN harness, so the store a
	   story sees is its own — otherwise every story on the autodocs page would share one
	   context and the last play function to run would decide what all of them show. */
	let arrivingStats = $state<Record<string, Stat[]>>({});
</script>

<!-- The server load found an instance: the wrapper's only job is to pull `stats` off the
     store, under the key its own provider and href make, and hand the rest of its props
     through untouched. -->
<Story
	name="Store holds stats"
	play={async ({ args, canvas, canvasElement }) => {
		await waitFor(async () => {
			await expect(canvasElement.querySelectorAll('dd')).toHaveLength(2);
		});

		// Labels asserted through `m` rather than a literal, so this is not a second copy of
		// messages/en.json that nothing keeps in step. The values are what prove the store's
		// stats reached the box, so both halves of a reading are checked.
		await expect(canvas.getByText(m.stat_dns_queries())).toBeInTheDocument();
		await expect(canvas.getByText(counts.format(1234))).toBeInTheDocument();

		await expect(canvas.getByText(m.stat_top_blocked_domain())).toBeInTheDocument();
		await expect(canvas.getByText('ads.example.com')).toBeInTheDocument();

		const link = canvas.getByRole('link');

		await expect(link).toHaveAttribute('href', args.href);

		// `--span` must always be emitted: an unset custom property makes `grid-column`
		// invalid at computed-value time and drops the whole declaration. The wrapper
		// forwards `span` as a token, so losing it here would silently unstyle the column.
		await expect(link).toHaveStyle({
			'--span': '6',
		});

		// The inset surface is translucent in all 27 themes, so it carries the blur.
		await expect(link).toHaveClass('backdrop-blur');
	}}
>
	{#snippet template(args)}
		<StatsStoreHarness
			stats={{
				[statsKey('adguard', HREF)]: healthy,
			}}
		>
			<BoxStatsWrapper {...args} />
		</StatsStoreHarness>
	{/snippet}
</Story>

<!-- What #17 fixed: the store holds one entry per configured instance, so a box has to
     look up ITS OWN target. Holding a single value handed the second box the first one's
     numbers and never contacted its host at all. Its own story, because axe only ever
     sees a story's rest state. -->
<Story
	name="Two instances read their own stats"
	play={async ({ canvas, canvasElement }) => {
		await waitFor(async () => {
			await expect(canvasElement.querySelectorAll('dd')).toHaveLength(4);
		});

		const firstReading = (href: string) =>
			canvasElement.querySelector(`a[href="${href}"] dd`)?.textContent;

		await expect(firstReading(HREF)).toBe(counts.format(1234));
		await expect(firstReading(SECOND_HREF)).toBe(counts.format(99));

		// The numbers differ, so a sighted reader can tell the two apart; the accessible
		// name has to as well. `getByRole` throws on more than one match, so naming each
		// host IS the assertion — a shared label makes both queries ambiguous. Axe cannot
		// stand in for it: identical-links-same-purpose is disabled by default.
		await expect(
			canvas.getByRole('link', {
				name: m.stats_open({
					provider: providerNameLabel.adguard,
					host: 'adguard.local',
				}),
			}),
		).toHaveAttribute('href', HREF);

		await expect(
			canvas.getByRole('link', {
				name: m.stats_open({
					provider: providerNameLabel.adguard,
					host: 'adguard.other',
				}),
			}),
		).toHaveAttribute('href', SECOND_HREF);
	}}
>
	{#snippet template(args)}
		<StatsStoreHarness
			stats={{
				[statsKey('adguard', HREF)]: healthy,
				[statsKey('adguard', SECOND_HREF)]: second,
			}}
		>
			<BoxStatsWrapper {...args} />
			<BoxStatsWrapper {...args} href={SECOND_HREF} />
		</StatsStoreHarness>
	{/snippet}
</Story>

<!-- The service is unreachable, or no instance was configured: business hands the failure
     back as a value, so the store holds no entry for this target and `stats` reaches the
     box as undefined. The box stays — its link is how an operator gets to the service's own
     UI to find out why. -->
<Story
	name="Store has no stats"
	play={async ({ args, canvas, canvasElement }) => {
		await waitFor(async () => {
			await expect(canvasElement.querySelectorAll('p')).toHaveLength(1);
		});

		await expect(
			canvas.getByText(
				m.stats_unavailable({
					provider: providerNameLabel.adguard,
				}),
			),
		).toBeInTheDocument();

		const link = canvas.getByRole('link');

		await expect(link).toHaveAttribute('href', args.href);

		await expect(link).toHaveStyle({
			'--span': '6',
		});
	}}
>
	{#snippet template(args)}
		<StatsStoreHarness stats={{}}>
			<BoxStatsWrapper {...args} />
		</StatsStoreHarness>
	{/snippet}
</Story>

<!-- Why the store holds a thunk and not a value: page data can change under a mounted
     box. A snapshot taken at construction would leave this box empty forever. -->
<Story
	name="Stats arriving after mount"
	args={{
		span: 12,
	}}
	play={async ({ canvas, canvasElement }) => {
		arrivingStats = {};

		await waitFor(async () => {
			await expect(canvasElement.querySelectorAll('p')).toHaveLength(1);
		});

		arrivingStats = {
			[statsKey('adguard', HREF)]: healthy,
		};

		await waitFor(async () => {
			await expect(canvasElement.querySelectorAll('dd')).toHaveLength(2);
		});

		await expect(canvas.getByRole('link')).toHaveStyle({
			'--span': '12',
		});
	}}
>
	{#snippet template(args)}
		<StatsStoreHarness stats={arrivingStats}>
			<BoxStatsWrapper {...args} />
		</StatsStoreHarness>
	{/snippet}
</Story>
