/**
 * A feed as the dashboard renders it, cached beside `readStats`.
 *
 * The shape crossing here is a LIST — titles and links, not numbers — which is what
 * roadmap #48 exists to add; the *arr release calendar (`/api/v3/calendar`) is meant
 * to become the second consumer of exactly this machinery.
 */

import type { FeedItem } from '$lib/business/type/feed';
import type { Result } from '$lib/utils/useAsyncErrorAsValue';
import { $getFeed, type FeedWire } from '$lib/data/repository/feed';

/**
 * The page load awaits every read, so without a bound of our own an unreachable host
 * stalls the whole render on undici's defaults. Minted HERE rather than in the
 * repository and handed down as a signal: the bound is a page-latency policy, the same
 * thing the TTL below is.
 */
const REQUEST_TIMEOUT_MS = 3000;
/**
 * Feeds change hourly at best, so this sits far above the stats window's 30s — long
 * enough that an open tab re-serving a cached list for five minutes reads as fresh,
 * short enough that a 60s refresh picks up new entries within about six. The client
 * refresh interval must stay above the STATS window it invalidates; this window only
 * has to be reached eventually by the same tick, which it is.
 */
const FEED_TTL_MS = 300_000;
/**
 * A hard cap against a pathological or hostile feed: the wire is parsed whole, but only
 * this many entries cross into the SSR payload and the store, however many the source
 * carries. The box's own `limit` slices further, per instance.
 */
const MAX_FEED_ITEMS = 50;
/**
 * Process state, on the same precedent as `stats.ts`: a store is unreachable from the
 * SSR path, and a `data/` module would be a second file for one caller with no external
 * name to own. Keyed by HREF alone — there is no provider token to disambiguate, so two
 * boxes naming one feed share one fetch and one entry legitimately, whatever their
 * separate `limit`s slice from it. Not pruned, like the stats cache: the keys come out
 * of `config.json`, bounded by a file one operator writes.
 */
const cache = new Map<string, { readAt: number; result: Result<FeedItem[]> }>();

/** The wire already IS rows; the projection only caps how far a feed can reach. */
export function projectFeed(data: FeedWire): FeedItem[] {
	return data.slice(0, MAX_FEED_ITEMS);
}

export type ReadFeedInput = {
	/** The feed URL, which is also the cache key and the key the page records under. */
	href: string;
};

/**
 * A read plus whether it actually went to the network — the same seam `StatsRead`
 * uses, and for the same reason: the route prints a failed read, and a cached failure
 * re-printed on every request is exactly the per-request spam #23 took out.
 */
export type FeedRead = {
	result: Result<FeedItem[]>;
	isFresh: boolean;
};

export async function readFeed({ href }: ReadFeedInput): Promise<FeedRead> {
	const now = Date.now();
	const cached = cache.get(href);

	if (cached && now - cached.readAt < FEED_TTL_MS) {
		return {
			result: cached.result,
			isFresh: false,
		};
	}

	// The FAILURE is cached too, which is the half that matters: a host that is switched
	// off is the one paying the 3s bound, so caching only successes would leave every
	// request paying it. Same reasoning as the stats cache — here the window expiring is
	// what retries.
	const [err, data] = await $getFeed({
		href,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	const result: Result<FeedItem[]> = err ? [err, null] : [null, projectFeed(data)];

	cache.set(href, {
		readAt: now,
		result,
	});

	return {
		result,
		isFresh: true,
	};
}
