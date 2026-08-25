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

/**
 * A set of feed reads folded into the shape a route hands on — the same seam
 * `StatsFold` uses, minus the credential half: a feed read has no secret to resolve.
 */
export type FeedFold = {
	/** Keyed by the bare href; a feed that failed is ABSENT, not empty. */
	feeds: Record<string, FeedItem[]>;
	/** The bare href of every feed that was asked and did not answer. */
	failed: string[];
	/** One line per failure that went to the network for THIS call, in config order. */
	errors: string[];
};

/**
 * Every read for a set of feeds, folded. The href is the whole identity a read has,
 * so it is both the key and what a failure reports.
 */
export async function readFeedsFor(hrefs: string[]): Promise<FeedFold> {
	// Concurrent, so the 3s bound stays the cost of the whole read rather than of each
	// feed in turn — same reasoning as `readStatsFor`. Collected first and folded
	// after, so the keys come out in config order.
	const reads = await Promise.all(
		hrefs.map(async (href) => ({
			href,
			read: await readFeed({
				href,
			}),
		})),
	);

	const fold: FeedFold = {
		feeds: {},
		failed: [],
		errors: [],
	};

	for (const { href, read } of reads) {
		const [err, items] = read.result;

		// Split like the stats fold: the log line names the host and what was wrong
		// with its answer and is gated on actually having gone to the network; what
		// crosses in `failed` is the bare href, which the route turns into copy.
		if (err) {
			if (read.isFresh) {
				fold.errors.push(err.message);
			}

			fold.failed.push(href);

			continue;
		}

		fold.feeds[href] = items;
	}

	return fold;
}
