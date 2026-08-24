import type { FeedItem } from '$lib/business/type/feed';
import { getContext, setContext } from 'svelte';

const CONTEXT_KEY = Symbol();

/**
 * Read-only view over the feeds loaded on the server. A thunk is held instead of local
 * state so that boxes instantiated from config stay in sync with the page data across
 * client-side navigations — the same shape `StatsStore` uses, because it solves the
 * same problem: nothing below this point is handed its data as a prop.
 */
export class FeedStore {
	#feeds: () => Record<string, FeedItem[]>;

	constructor(feeds: () => Record<string, FeedItem[]>) {
		this.#feeds = feeds;
	}

	/**
	 * Keyed by href alone — the feed read has no provider token, so the URL is the whole
	 * identity — and an absent key is the whole seam: it means this feed was never read,
	 * or was read and did not answer, and the box renders its unavailable line either way.
	 */
	items(href: string): FeedItem[] | undefined {
		const feeds = this.#feeds();

		return Object.hasOwn(feeds, href) ? feeds[href] : undefined;
	}
}

export function setFeedStore(feeds: () => Record<string, FeedItem[]>): FeedStore {
	return setContext<FeedStore>(CONTEXT_KEY, new FeedStore(feeds));
}

/** `undefined` wherever no component above set the store — a story mounting a wrapper alone. */
export function getFeedStore(): FeedStore | undefined {
	return getContext<FeedStore | undefined>(CONTEXT_KEY);
}
