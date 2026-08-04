<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import BoxAdguardWrapper from '$lib/presentation/components/box-adguard-wrapper.svelte';
	import { m } from '$lib/paraglide/messages';

	const healthy = {
		dnsQueries: 1234,
		numBlockedFiltering: 56,
		avgProcessingTimeMs: 12,
		topBlockedDomain: 'ads.example.com',
	};

	const { Story } = defineMeta({
		title: 'Components/Box Adguard Wrapper',
		component: BoxAdguardWrapper,
		tags: ['autodocs'],
		args: {
			href: 'http://adguard.local',
			span: 6,
		},
	});
</script>

<script lang="ts">
	import type { AdguardStats } from '$lib/business/type/adguard-stats';
	import AdguardStoreHarness from '$lib/test/adguard-store-harness.svelte';

	/* Only the last story reads this. Each story mounts its OWN harness, so the store a
	   story sees is its own — otherwise every story on the autodocs page would share one
	   context and the last play function to run would decide what all of them show. */
	let arrivingStats = $state<AdguardStats | undefined>(undefined);
</script>

<!-- The server load found an AdGuard instance: the wrapper's only job is to pull `stats`
     off the store and hand the rest of its props through untouched. -->
<Story
	name="Store holds stats"
	play={async ({ args, canvas, canvasElement }) => {
		await waitFor(async () => {
			await expect(canvasElement.querySelectorAll('p')).toHaveLength(4);
		});

		// Asserted through `m` rather than a literal, so this is not a second copy of
		// messages/en.json that nothing keeps in step.
		await expect(
			canvas.getByText(
				m.adguard_dns_queries({
					count: healthy.dnsQueries,
				}),
			),
		).toBeInTheDocument();

		await expect(
			canvas.getByText(
				m.adguard_top_blocked_domain({
					domain: healthy.topBlockedDomain,
				}),
			),
		).toBeInTheDocument();

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
		<AdguardStoreHarness stats={healthy}>
			<BoxAdguardWrapper {...args} />
		</AdguardStoreHarness>
	{/snippet}
</Story>

<!-- AdGuard unreachable, or no instance configured: business hands the failure back as a
     value, so the store holds no stats and `stats` reaches the box as undefined. The box
     stays — its link is how an operator gets to the admin UI to find out why. -->
<Story
	name="Store has no stats"
	play={async ({ args, canvas, canvasElement }) => {
		await waitFor(async () => {
			await expect(canvasElement.querySelectorAll('p')).toHaveLength(1);
		});

		await expect(canvas.getByText(m.adguard_unavailable())).toBeInTheDocument();

		const link = canvas.getByRole('link');

		await expect(link).toHaveAttribute('href', args.href);

		await expect(link).toHaveStyle({
			'--span': '6',
		});
	}}
>
	{#snippet template(args)}
		<AdguardStoreHarness stats={undefined}>
			<BoxAdguardWrapper {...args} />
		</AdguardStoreHarness>
	{/snippet}
</Story>

<!-- Why the store holds a getter and not a value: page data can change under a mounted
     box. A snapshot taken at construction would leave this box empty forever. -->
<Story
	name="Stats arriving after mount"
	args={{
		span: 12,
	}}
	play={async ({ canvas, canvasElement }) => {
		arrivingStats = undefined;

		await waitFor(async () => {
			await expect(canvasElement.querySelectorAll('p')).toHaveLength(1);
		});

		arrivingStats = healthy;

		await waitFor(async () => {
			await expect(canvasElement.querySelectorAll('p')).toHaveLength(4);
		});

		await expect(canvas.getByRole('link')).toHaveStyle({
			'--span': '12',
		});
	}}
>
	{#snippet template(args)}
		<AdguardStoreHarness stats={arrivingStats}>
			<BoxAdguardWrapper {...args} />
		</AdguardStoreHarness>
	{/snippet}
</Story>
