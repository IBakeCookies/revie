<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import BoxFeed from '$lib/presentation/components/box-feed.svelte';
	import { getFeedStore } from '$lib/business/store/feed-store.svelte';

	type Props = Omit<ComponentProps<typeof BoxFeed>, 'items'> & {
		/** The feed URL, which is what the store's entries are keyed by. */
		href: string;
	};

	let props: Props = $props();
	const feedStore = getFeedStore();

	// `?.`, like box-stats-wrapper: `getFeedStore` returns `T | undefined` because
	// `getContext` answers `undefined` wherever no page component set the store — which a
	// story mounting this wrapper alone is.
	const items = $derived(feedStore?.items(props.href));
</script>

<BoxFeed limit={props.limit} span={props.span} {items} />
