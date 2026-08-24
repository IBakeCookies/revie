<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import BoxFeedWrapper from '$lib/presentation/components/box-feed-wrapper.svelte';
	import { m } from '$lib/paraglide/messages';

	const HREF = 'https://example.local/feed.xml';
	const SECOND_HREF = 'https://example.other/rss.xml';

	const rows = (count: number) =>
		Array.from(
			{
				length: count,
			},
			(_, index) => ({
				title: `Entry ${index + 1}`,
				link: `https://example.local/${index + 1}`,
			}),
		);

	const { Story } = defineMeta({
		title: 'Components/Box Feed Wrapper',
		component: BoxFeedWrapper,
		tags: ['autodocs'],
		args: {
			href: HREF,
			span: 6,
		},
	});
</script>

<script lang="ts">
	import type { FeedItem } from '$lib/business/type/feed';
	import FeedStoreHarness from '$lib/test/feed-store-harness.svelte';

	/* Only the last story reads this. Each story mounts its OWN harness, so the store a
	   story sees is its own — otherwise every story on the autodocs page would share one
	   context and the last play function to run would decide what all of them show. */
	let arrivingFeeds = $state<Record<string, FeedItem[]>>({});
</script>

<!-- The server load found the feed: the wrapper's only job is to pull `items` off the
     store, under the key its own href makes, and hand the rest of its props through. -->
<Story
	name="Store holds items"
	play={async ({ canvas, canvasElement }) => {
		await waitFor(async () => {
			await expect(
				canvas.getByRole('link', {
					name: 'Entry 1',
				}),
			).toBeInTheDocument();
		});

		// The titles are the links' accessible names — there is no other copy anywhere.
		await expect(
			canvas.getByRole('link', {
				name: 'Entry 2',
			}),
		).toHaveAttribute('href', 'https://example.local/2');

		// Rows leave for the outside world: the dashboard's internal address does not
		// ride along, exactly like every external link in this app.
		await expect(canvas.getAllByRole('link')).toHaveLength(10);
		const first = canvas.getAllByRole('link')[0];

		await expect(first).toHaveAttribute('target', '_blank');
		await expect(first).toHaveAttribute('rel', 'noreferrer');

		// `--span` must always be emitted: an unset custom property makes `grid-column`
		// invalid at computed-value time, which drops the declaration.
		const box = canvasElement.querySelector('div')!;

		await expect(box).toHaveStyle({
			'--span': '6',
		});

		// It draws a surface, so it reads the container's fill and frosts the scenery
		// behind it. The computed value is the assertion and not just the class, because
		// one typo inside the var() makes the declaration invalid — and an invalid
		// background computes to transparent with no error anywhere.
		await expect(box).toHaveClass('bg-(--box-surface,var(--surface-card))');
		await expect(box).toHaveClass('backdrop-blur');
		await expect(getComputedStyle(box).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
	}}
>
	{#snippet template(args)}
		<FeedStoreHarness
			feeds={{
				[HREF]: rows(12),
			}}
		>
			<BoxFeedWrapper {...args} />
		</FeedStoreHarness>
	{/snippet}
</Story>

<!-- No `limit` prop: ten rows out of twelve arrive — the default doing the trimming,
     not the store, which holds everything the read kept. -->
<Story
	name="Defaults to ten rows"
	play={async ({ canvas }) => {
		await expect(canvas.getAllByRole('link')).toHaveLength(10);
	}}
>
	{#snippet template(args)}
		<FeedStoreHarness
			feeds={{
				[HREF]: rows(12),
			}}
		>
			<BoxFeedWrapper {...args} />
		</FeedStoreHarness>
	{/snippet}
</Story>

<!-- A configured limit trims per instance: the same feed behind two boxes, each showing
     its own slice, is the config the href-keyed cache exists to serve cheaply. -->
<Story
	name="Limit trims the rows"
	args={{
		limit: 3,
	}}
	play={async ({ canvas }) => {
		await expect(canvas.getAllByRole('link')).toHaveLength(3);

		// The FIRST three, not any three: feed order is newest first.
		await expect(canvas.getAllByRole('link')[0]).toHaveAccessibleName('Entry 1');
	}}
>
	{#snippet template(args)}
		<FeedStoreHarness
			feeds={{
				[HREF]: rows(12),
			}}
		>
			<BoxFeedWrapper {...args} />
		</FeedStoreHarness>
	{/snippet}
</Story>

<!-- Two boxes over two feeds: each looks up ITS OWN href, which is why the lookup takes
     one at all instead of reading a single shared list. Its own story, because axe only
     ever sees a story's rest state. -->
<Story
	name="Two instances read their own feed"
	play={async ({ canvasElement }) => {
		await waitFor(async () => {
			await expect(canvasElement.querySelectorAll('a')).toHaveLength(4);
		});

		expect([...canvasElement.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
			'https://example.local/1',
			'https://example.local/2',
			'https://example.other/1',
			'https://example.other/2',
		]);
	}}
>
	{#snippet template(args)}
		<FeedStoreHarness
			feeds={{
				[HREF]: rows(2),
				[SECOND_HREF]: [
					{
						title: 'Other 1',
						link: 'https://example.other/1',
					},
					{
						title: 'Other 2',
						link: 'https://example.other/2',
					},
				],
			}}
		>
			<BoxFeedWrapper {...args} />
			<BoxFeedWrapper {...args} href={SECOND_HREF} />
		</FeedStoreHarness>
	{/snippet}
</Story>

<!-- The source is unreachable, or no feed was configured: business hands the failure
     back as a value, so the store holds no entry for this href and `items` reaches the
     box as undefined. The box stays, saying so, because vanishing reads as a layout bug. -->
<Story
	name="Store has no items"
	play={async ({ canvas, canvasElement }) => {
		await waitFor(async () => {
			await expect(canvas.getByText(m.feed_unavailable())).toBeInTheDocument();
		});

		// No list, and no link of any kind: nothing here can go somewhere useful.
		await expect(canvasElement.querySelectorAll('ul')).toHaveLength(0);
		await expect(canvasElement.querySelectorAll('a')).toHaveLength(0);

		await expect(canvasElement.querySelector('div')).toHaveStyle({
			'--span': '6',
		});
	}}
>
	{#snippet template(args)}
		<FeedStoreHarness feeds={{}}>
			<BoxFeedWrapper {...args} />
		</FeedStoreHarness>
	{/snippet}
</Story>

<!-- Why the store holds a thunk and not a value: page data can change under a mounted
     box. A snapshot taken at construction would leave this box empty forever. -->
<Story
	name="Items arriving after mount"
	args={{
		span: 12,
	}}
	play={async ({ canvas, canvasElement }) => {
		arrivingFeeds = {};

		await waitFor(async () => {
			await expect(canvas.getByText(m.feed_unavailable())).toBeInTheDocument();
		});

		arrivingFeeds = {
			[HREF]: rows(2),
		};

		await waitFor(async () => {
			await expect(canvas.getAllByRole('link')).toHaveLength(2);
		});

		await expect(canvasElement.querySelector('div')).toHaveStyle({
			'--span': '12',
		});
	}}
>
	{#snippet template(args)}
		<FeedStoreHarness feeds={arrivingFeeds}>
			<BoxFeedWrapper {...args} />
		</FeedStoreHarness>
	{/snippet}
</Story>
