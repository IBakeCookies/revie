<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, spyOn, waitFor } from 'storybook/test';
	import type { ConfigContainer } from '$lib/business/model/config';
	import type { Stat } from '$lib/business/type/stats';
	import icon from '$lib/presentation/assets/favicon.svg';
	import Page from '$lib/presentation/components/page.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { statsKey } from '$lib/business/model/config';

	const ADGUARD_HREF = 'http://adguard.test:3000';
	const SERVICE_HREF = 'http://jellyfin.test:8096';

	/* The store's report seam. Handed in as a prop rather than read from a toast store,
	   because that is the shape page.svelte is built to: a getContext here would make it
	   unmountable without a layout above it, which is exactly what a story is. */
	const notify = fn();

	/* Built from the same locale the box reads, so a render in the wrong locale cannot
	   pass by matching a hardcoded string. */
	const counts = new Intl.NumberFormat(getLocale());
	const millis = new Intl.NumberFormat(getLocale(), {
		style: 'unit',
		unit: 'millisecond',
		unitDisplay: 'narrow',
	});

	/* Named rather than inlined into `args`, so the play function asserts against the
	   payload the page was handed instead of a second copy of the numbers. */
	const readings: Stat[] = [
		{
			key: 'dns-queries',
			value: 1234,
		},
		{
			key: 'blocked',
			value: 88,
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

	/* Shaped like normalized config, not like component props: a service nested inside
	   a grid is what makes the recursion and the href collection do any work. */
	const containers: ConfigContainer[] = [
		{
			name: 'Grid',
			props: {
				title: 'Media',
				subTitle: 'Behind the reverse proxy',
				span: 12,
				items: [
					{
						name: 'BoxService',
						props: {
							title: 'Jellyfin',
							href: SERVICE_HREF,
							span: 6,
							img: {
								src: icon,
							},
						},
					},
					{
						name: 'BoxStats',
						props: {
							provider: 'adguard',
							href: ADGUARD_HREF,
							span: 6,
						},
					},
				],
			},
		},
		{
			name: 'BoxDate',
			props: {
				span: 4,
			},
		},
	];

	const { Story } = defineMeta({
		title: 'Components/Page',
		component: Page,
		tags: ['autodocs'],
		args: {
			containers,
			stats: {
				[statsKey('adguard', ADGUARD_HREF)]: readings,
			},
		},
		// The poll starts from this component's $effect at mount, so the stub has to be
		// installed before the story renders — one put up inside `play` arrives after the
		// probe has already gone out. Restoring it is the other half: `clearMocks` drops
		// call history but leaves a spy sitting on the global, answering for every later
		// story in the file.
		beforeEach: () => {
			const ping = spyOn(window, 'fetch').mockImplementation(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							isAlive: true,
						}),
					),
				),
			);

			return () => ping.mockRestore();
		},
	});
</script>

<!-- The composition root of a config page: no box below is handed its data as a prop,
     so what is really under test is the two stores this component sets. -->
<Story
	name="With stats data"
	play={async ({ canvas, canvasElement }) => {
		// The grid recursion runs — a container two levels down reaches its renderer.
		await expect(
			canvas.getByRole('heading', {
				name: 'Media',
			}),
		).toBeInTheDocument();

		await expect(
			canvas.getByRole('heading', {
				name: 'Jellyfin',
			}),
		).toBeInTheDocument();

		// `span` is a config token that has to land as the `--span` custom property: an
		// unset one makes `grid-column` invalid at computed-value time, which drops the
		// declaration and the column rule with it.
		await expect(canvasElement.firstElementChild).toHaveStyle({
			'--span': '12',
		});

		// The four readings exist only because `setStatsStore(() => stats)` put the SSR
		// payload somewhere the wrapper could look its own target up in — nothing is passed
		// down along the way. Asserting the label/value pairs is what proves the payload
		// itself arrived: four empty tiles would satisfy a count of the labels alone.
		const tiles = [...canvasElement.querySelectorAll(`a[href="${ADGUARD_HREF}"] dl > div`)];

		await expect(
			tiles.map((tile) => [
				tile.querySelector('dt')?.textContent,
				tile.querySelector('dd')?.textContent,
			]),
		).toEqual([
			[m.stat_dns_queries(), counts.format(1234)],
			[m.stat_blocked(), counts.format(88)],
			[m.stat_avg_latency(), millis.format(12)],
			[m.stat_top_blocked_domain(), 'ads.example.com'],
		]);

		// The other store: the dot only leaves "status unknown" once the poll this
		// component starts has resolved a probe into the services store.
		await expect(await canvas.findByLabelText('online')).toBeInTheDocument();
	}}
/>

<!-- The service is switched off, unreachable, or not configured: the load function hands
     down an empty record, which is an EMPTY store rather than no store — the wrapper
     reading a missing context would render the box with no readings either way, so the
     branch that matters is that nothing else on the page notices. -->
<Story
	name="Without stats data"
	args={{
		stats: {},
	}}
	play={async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelector(`a[href="${ADGUARD_HREF}"]`)).toBeInTheDocument();
		// The unavailable line in place of the readings: no tile list at all, and the one
		// remaining <p> in the box is that line.
		await expect(canvasElement.querySelectorAll(`a[href="${ADGUARD_HREF}"] dl`)).toHaveLength(0);
		await expect(canvasElement.querySelectorAll(`a[href="${ADGUARD_HREF}"] p`)).toHaveLength(1);
		await expect(canvas.queryByText(m.stat_dns_queries())).not.toBeInTheDocument();

		// A missing read must not take its siblings with it — grid, service and the
		// service's own probe are all unaffected.
		await expect(
			canvas.getByRole('heading', {
				name: 'Jellyfin',
			}),
		).toBeInTheDocument();

		await expect(await canvas.findByLabelText('online')).toBeInTheDocument();
	}}
/>

<!-- The report seam, which nothing else in the suite exercises: `setServicesStore(notify)`
     is all this component does with the callback, so dropping the argument left every
     other story green and every failed probe silent. What crosses is the href and
     nothing else — the store's own message has no locale and goes to the log. -->
<Story
	name="Failed probe reaches the caller"
	args={{
		notify,
		stats: {},
	}}
	beforeEach={() => {
		// Installed over the meta's answering stub, and before the mount for the same
		// reason it is: the poll goes out from an $effect at mount, so a stub put up
		// inside `play` arrives after the probe it is meant to fail.
		const ping = spyOn(window, 'fetch').mockRejectedValue(new Error('unreachable'));

		return () => ping.mockRestore();
	}}
	play={async ({ canvas }) => {
		await waitFor(() => expect(notify).toHaveBeenCalledWith(SERVICE_HREF));

		// A probe that failed is not a service that is down: the store keeps the last
		// known state, which on first paint is none at all.
		await expect(canvas.getByLabelText(m.service_status_unknown())).toBeInTheDocument();
	}}
/>

<!-- What a page looks like when `normalizeConfig` dropped every entry in it. Both
     stores and the poll are set up before the {#each}, so an empty page still has to
     mount cleanly instead of throwing on the way to rendering nothing. -->
<Story
	name="No containers"
	args={{
		containers: [],
		stats: {},
	}}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelectorAll('a')).toHaveLength(0);
		await expect(canvasElement.textContent?.trim()).toBe('');
	}}
/>
