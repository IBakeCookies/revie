<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, spyOn } from 'storybook/test';
	import type { ConfigContainer } from '$lib/business/model/config';
	import Page from '$lib/presentation/components/page.svelte';

	const ADGUARD_HREF = 'http://adguard.test:3000';

	/* A 1x1 gif, so no story waits on a file the browser has to go and fetch. */
	const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

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
							href: 'http://jellyfin.test:8096',
							span: 6,
							img: {
								src: PIXEL,
							},
						},
					},
					{
						name: 'BoxAdguard',
						props: {
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
			adguard: {
				dnsQueries: 1234,
				numBlockedFiltering: 88,
				avgProcessingTimeMs: 12,
				topBlockedDomain: 'ads.example.com',
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
	name="With AdGuard data"
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

		// The four readings exist only because `setAdguardStore(() => adguard ?? undefined)`
		// put the SSR payload somewhere the wrapper could read it — `stats` is passed to
		// nothing along the way.
		await expect(canvasElement.querySelectorAll(`a[href="${ADGUARD_HREF}"] p`)).toHaveLength(4);
		await expect(canvas.getByText('DNS queries: 1234')).toBeInTheDocument();

		// The other store: the dot only leaves "status unknown" once the poll this
		// component starts has resolved a probe into the services store.
		await expect(await canvas.findByLabelText('online')).toBeInTheDocument();
	}}
/>

<!-- AdGuard switched off, unreachable, or not configured: the load function hands down
     `null`, and `?? undefined` is what keeps that an EMPTY store rather than no store —
     the wrapper reading a missing context would render the box with no readings either
     way, so the branch that matters is that nothing else on the page notices. -->
<Story
	name="Without AdGuard data"
	args={{
		adguard: null,
	}}
	play={async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelector(`a[href="${ADGUARD_HREF}"]`)).toBeInTheDocument();
		await expect(canvasElement.querySelectorAll(`a[href="${ADGUARD_HREF}"] p`)).toHaveLength(1);
		await expect(canvas.queryByText(/DNS queries/)).not.toBeInTheDocument();

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

<!-- What a page looks like when `normalizeConfig` dropped every entry in it. Both
     stores and the poll are set up before the {#each}, so an empty page still has to
     mount cleanly instead of throwing on the way to rendering nothing. -->
<Story
	name="No containers"
	args={{
		containers: [],
		adguard: null,
	}}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelectorAll('a')).toHaveLength(0);
		await expect(canvasElement.textContent?.trim()).toBe('');
	}}
/>
