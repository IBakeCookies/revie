import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $getFeed, type FeedWire } from '$lib/data/repository/feed';
import { projectFeed, readFeed, readFeedsFor } from '$lib/business/model/feed';

vi.mock('$lib/data/repository/feed', () => ({
	$getFeed: vi.fn(),
}));

/** Mirrors `FEED_TTL_MS`, which the module does not export — the same shape as `stats.spec.ts`. */
const FEED_TTL_MS = 300_000;
/** Mirrors `MAX_FEED_ITEMS` for the same reason. */
const MAX_FEED_ITEMS = 50;

/**
 * The TTL cache is module-scope process state keyed by href alone — there is no
 * provider token to disambiguate — so every case reads its own href, the same trick
 * `admin-auth.spec.ts` uses to give each of its cases an address of its own.
 */
function input(href: string) {
	return {
		href,
	};
}

const wire: FeedWire = [
	{
		title: 'First',
		link: 'https://example.local/first',
	},
	{
		title: 'Second',
		link: 'https://example.local/second',
	},
];

const failure = {
	message: 'answered 200 without a single readable entry',
};

describe('projectFeed', () => {
	it('hands the rows over in feed order', () => {
		expect(projectFeed(wire)).toEqual(wire);
	});

	// A hard cap against a pathological or hostile source: however many entries the wire
	// carried, only this many cross into the SSR payload.
	it('caps how far one feed can reach', () => {
		const flood = Array.from(
			{
				length: MAX_FEED_ITEMS + 10,
			},
			(_, index) => ({
				title: `Entry ${index}`,
				link: `https://example.local/${index}`,
			}),
		);

		expect(projectFeed(flood)).toHaveLength(MAX_FEED_ITEMS);
	});
});

describe('readFeed', () => {
	beforeEach(() => {
		vi.mocked($getFeed).mockReset();
		// The cache keys on `Date.now()`, so the window is walked rather than waited out.
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('projects a successful read', async () => {
		vi.mocked($getFeed).mockResolvedValue([null, wire]);

		const read = await readFeed(input('https://projected.local'));

		expect(read.isFresh).toBe(true);
		expect(read.result).toEqual([null, wire]);
	});

	it('hands the repository error back untouched', async () => {
		vi.mocked($getFeed).mockResolvedValue([failure, null]);

		const [err, items] = (await readFeed(input('https://untouched.local'))).result;

		expect(items).toBeNull();
		expect(err).toBe(failure);
	});

	/**
	 * The bound belongs to the read and not to the wire, so it is minted here and handed
	 * down — asserting the VALUE, not just that a signal exists, because
	 * `AbortSignal.timeout` runs on an internal timer no fake clock reaches.
	 */
	it('bounds the whole read at 3s, so an unreachable host cannot stall the page load', async () => {
		const timeout = vi.spyOn(AbortSignal, 'timeout');

		vi.mocked($getFeed).mockResolvedValue([null, wire]);

		await readFeed(input('https://bounded.local'));

		expect(timeout).toHaveBeenCalledWith(3000);

		expect(vi.mocked($getFeed).mock.calls[0][0].signal).toBe(timeout.mock.results[0].value);
	});

	it('serves a second read inside the window from the cache', async () => {
		vi.mocked($getFeed).mockResolvedValue([null, wire]);

		await readFeed(input('https://cached.local'));

		vi.advanceTimersByTime(FEED_TTL_MS - 1);

		const second = await readFeed(input('https://cached.local'));

		expect($getFeed).toHaveBeenCalledOnce();
		expect(second.result).toEqual([null, wire]);
		expect(second.isFresh).toBe(false);
	});

	// A host that is switched off is the one paying the 3s bound; caching failures too is
	// what keeps every request from paying it, with `isFresh` stopping the route from
	// re-printing the same failure each time.
	it('serves a cached FAILURE inside the window, and does not re-report it', async () => {
		vi.mocked($getFeed).mockResolvedValue([failure, null]);

		const first = await readFeed(input('https://dead.local'));

		vi.advanceTimersByTime(FEED_TTL_MS - 1);

		const second = await readFeed(input('https://dead.local'));

		expect($getFeed).toHaveBeenCalledOnce();
		expect(first.isFresh).toBe(true);
		expect(second.isFresh).toBe(false);
		expect(second.result[0]).toBe(failure);
	});

	it('reads again once the window has passed', async () => {
		vi.mocked($getFeed).mockResolvedValue([failure, null]);

		await readFeed(input('https://expiring.local'));

		vi.advanceTimersByTime(FEED_TTL_MS);

		const second = await readFeed(input('https://expiring.local'));

		expect($getFeed).toHaveBeenCalledTimes(2);
		expect(second.isFresh).toBe(true);
	});

	// Keyed by href rather than as one blob, so a dead feed beside a live one does not
	// cost the live one its entry on every read.
	it('does not let a dead feed evict a live one', async () => {
		vi.mocked($getFeed).mockImplementation(async ({ href }) =>
			href === 'https://live.local' ? [null, wire] : [failure, null],
		);

		await readFeed(input('https://live.local'));
		await readFeed(input('https://dead.other'));

		const live = await readFeed(input('https://live.local'));

		expect($getFeed).toHaveBeenCalledTimes(2);
		expect(live.isFresh).toBe(false);
		expect(live.result).toEqual([null, wire]);
	});
});

/**
 * The fold both callers share — the page load for first paint, `/api/stats` for every
 * refresh tick. The repository is mocked whole (`readFeed` above covers the read), so
 * this pins the folding: keyed per href, failures as data, log lines only for reads
 * that went to the network.
 */
describe('readFeedsFor', () => {
	beforeEach(() => {
		vi.mocked($getFeed).mockReset();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('folds successful reads into feeds, keyed per href', async () => {
		vi.mocked($getFeed).mockResolvedValue([null, wire]);

		const fold = await readFeedsFor(['https://folded.local']);

		expect(fold.feeds).toEqual({
			'https://folded.local': wire,
		});

		expect(fold.failed).toEqual([]);
		expect(fold.errors).toEqual([]);
	});

	// One feed down does not blank the one that answered, and the failed href is ABSENT
	// from feeds, not present and empty — the box renders its unavailable line.
	it('keeps the feeds that answered when another one did not', async () => {
		vi.mocked($getFeed).mockImplementation(async ({ href }) =>
			href === 'https://live-fold.local' ? [null, wire] : [failure, null],
		);

		const fold = await readFeedsFor(['https://live-fold.local', 'https://dead-fold.local']);

		expect(fold.feeds).toEqual({
			'https://live-fold.local': wire,
		});

		expect(fold.failed).toEqual(['https://dead-fold.local']);
		expect(fold.errors).toEqual([failure.message]);
	});

	// Same gate as the stats fold: a failure served from the TTL cache still fails its
	// box but must not be re-printed once per request by a refreshing tab.
	it('logs a fresh failure but not a cached one', async () => {
		vi.mocked($getFeed).mockResolvedValue([failure, null]);

		const href = 'https://logged-once.local';
		const first = await readFeedsFor([href]);
		expect(first.errors).toEqual([failure.message]);

		vi.advanceTimersByTime(FEED_TTL_MS - 1);

		const second = await readFeedsFor([href]);
		expect(second.errors).toEqual([]);
		expect(second.failed).toEqual([href]);

		vi.advanceTimersByTime(1);

		const third = await readFeedsFor([href]);
		expect(third.errors).toEqual([failure.message]);
	});
});
