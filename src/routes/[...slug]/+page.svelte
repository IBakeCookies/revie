<script lang="ts">
	import type { PageProps } from './$types';
	import type { Stat } from '$lib/business/type/stats';
	import type { FeedItem } from '$lib/business/type/feed';
	import Page from '$lib/presentation/components/page.svelte';
	import QuickJump from '$lib/presentation/components/quick-jump.svelte';
	import { getToastStore } from '$lib/business/store/toast-store.svelte';
	import { m } from '$lib/paraglide/messages';
	import { providerNameLabel } from '$lib/presentation/util/provider-name';

	/**
	 * At least the stats cache's own TTL in `business/model/stats.ts` (30s), or a tick
	 * is served the same cached reading and the box never moves. Comfortably above
	 * `TOAST_MS` too, so a refusal that keeps failing does not pin its toast on screen.
	 */
	const REFRESH_INTERVAL_MS = 60_000;

	let { data }: PageProps = $props();

	type FailedStat = PageProps['data']['failedStats'][number];

	/** What POST /api/stats answers, in the shape its folds fold into. */
	type StatsRefresh = {
		stats: Record<string, Stat[]>;
		failedStats: FailedStat[];
		feeds: Record<string, FeedItem[]>;
		failedFeeds: string[];
	};

	const toasts = getToastStore();

	/**
	 * Which failures have already been said out loud, by the same key the readings are
	 * recorded under — the stats `statsKey(provider, href)` string, and a feed's bare
	 * href. The two never collide (a stats key always carries its provider prefix), so
	 * one list serves both channels.
	 *
	 * `ToastStore` dedupes against what is CURRENTLY on screen, so it cannot cover this:
	 * every refresh hands down a failure list, the effect re-runs on it, and a toast
	 * the user dismissed — or that timed itself out — would be raised again forever.
	 * Entries are dropped as instances recover, so a box that fails again is reported
	 * again.
	 *
	 * A plain `let`, not `$state`: nothing renders it, and the effect must not depend on
	 * it. A list rather than a `Set` for the same reason —
	 * `svelte/prefer-svelte-reactivity` rejects a mutable built-in `Set` in a component,
	 * and a reactive one is the opposite of what this needs. It holds one entry per box
	 * on the page, so `includes` is right.
	 */
	let reportedFailures: string[] = [];

	/**
	 * What refreshes have answered since this component mounted, as an overlay over
	 * `data`. Until the first tick lands, the load's payload IS the picture — the
	 * views below read it outright — and once one lands, it owns the whole picture:
	 * an instance that answered replaces its entry, and one that failed is deleted
	 * outright, so its box falls back to its unavailable line instead of quietly
	 * showing yesterday's numbers beside a toast saying they are gone.
	 *
	 * A client-side navigation reuses this very component with someone else's payload,
	 * so the reset effect below drops the overlay on every new `data` and the views
	 * fall back to the new base until the next tick. Nothing here needs to know how to
	 * unmerge.
	 */
	let hasPolled = $state(false);
	let polledStats = $state.raw<Record<string, Stat[]>>({});
	let polledFeeds = $state.raw<Record<string, FeedItem[]>>({});
	let polledFailedStats = $state.raw<FailedStat[]>([]);
	let polledFailedFeeds = $state.raw<string[]>([]);

	$effect(() => {
		hasPolled = false;
		polledStats = {};
		polledFeeds = {};
		polledFailedStats = [];
		polledFailedFeeds = [];
	});

	const stats = $derived.by(() => {
		const merged = {
			...(hasPolled ? polledStats : data.stats),
		};

		for (const failure of hasPolled ? polledFailedStats : data.failedStats) {
			delete merged[failure.key];
		}

		return merged;
	});

	const feeds = $derived.by(() => ({
		...(hasPolled ? polledFeeds : data.feeds),
	}));

	const failedStats = $derived(hasPolled ? polledFailedStats : data.failedStats);
	const failedFeeds = $derived(hasPolled ? polledFailedFeeds : data.failedFeeds);

	// This route is where every failure gets its words. All three stores below hand over
	// data only — a provider and an href from the load or the refresh, an href from the
	// probe or from the feed read — and the paraglide call is here, in presentation, so
	// every toast follows the user's language.
	//
	// The server can only log, which reaches an operator's journal and nobody looking at
	// the page. This is what tells them WHY a box is empty, and which one; the reason it
	// failed stays in that log, which already names the host and the status.
	//
	// N failing instances raise N toasts, uncapped and on purpose: a summary line is
	// exactly the "true for one, useless for eight" failure this seam exists to fix.
	$effect(() => {
		const failing = [...failedStats.map(({ key }) => key), ...failedFeeds];

		// Dropped as instances recover, so a box that fails again is reported again.
		reportedFailures = reportedFailures.filter((key) => failing.includes(key));

		for (const failure of failedStats) {
			if (reportedFailures.includes(failure.key)) {
				continue;
			}

			reportedFailures.push(failure.key);

			toasts.show(
				m.stats_load_failed({
					provider: providerNameLabel[failure.provider],
					href: failure.href,
				}),
			);
		}

		for (const href of failedFeeds) {
			if (reportedFailures.includes(href)) {
				continue;
			}

			reportedFailures.push(href);

			toasts.show(
				m.feed_load_failed({
					href,
				}),
			);
		}
	});

	/**
	 * Whether this page has anything a refresh could move. `[...slug]` matches every config
	 * page, so an ungated interval spends a round trip a minute on an install with no
	 * live data at all — for a record that is always empty. A reading that arrived and a
	 * read that failed are the two states worth re-asking; no box configured and a secret
	 * that is not set both read as an absence here, and neither changes without a restart.
	 */
	const refreshable = $derived(
		failedStats.length > 0 ||
			Object.keys(stats).length > 0 ||
			failedFeeds.length > 0 ||
			Object.keys(feeds).length > 0,
	);

	// A stats box is the one widget reading live data, and it used to go stale within a
	// minute of mounting — hence the refresh. The tick polls `/api/stats` rather than
	// invalidating the load: invalidating re-ran the WHOLE load, so a bad tick swapped
	// the dashboard for the error page and parked the tab there until a manual reload.
	// No eager first tick: the load that mounted this has just run.
	$effect(() => {
		if (!refreshable) {
			return;
		}

		const controller = new AbortController();

		async function refresh(): Promise<void> {
			// A hidden tab is nobody reading. Browsers freeze background timers anyway, so
			// an unguarded interval would not keep up either — it would only spend the
			// server's 3s bound the moment the tab came back.
			if (document.visibilityState !== 'visible') {
				return;
			}

			// Named before the await: a navigation mid-read must not hand its answer to
			// the payload that replaced this one.
			const forData = data;

			try {
				const response = await fetch('/api/stats', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					signal: controller.signal,
					body: JSON.stringify({
						stats: [...Object.keys(forData.stats), ...forData.failedStats.map(({ key }) => key)],
						feeds: [...Object.keys(forData.feeds), ...forData.failedFeeds],
					}),
				});

				if (!response.ok) {
					return;
				}

				const payload = (await response.json()) as StatsRefresh;

				if (data !== forData) {
					return;
				}

				hasPolled = true;

				polledStats = {
					...polledStats,
					...payload.stats,
				};

				polledFailedStats = payload.failedStats;

				polledFeeds = {
					...polledFeeds,
					...payload.feeds,
				};

				polledFailedFeeds = payload.failedFeeds;
			} catch {
				// Aborted at teardown, or the network dropped under the tick. Nothing to
				// merge and nothing worth saying: the next tick retries, and the boxes
				// keep what they had.
			}
		}

		const id = setInterval(refresh, REFRESH_INTERVAL_MS);

		return () => {
			clearInterval(id);
			controller.abort();
		};
	});
</script>

<Page
	{stats}
	{feeds}
	containers={data.containers}
	notify={(href) =>
		toasts.show(
			m.service_probe_failed({
				href,
			}),
		)}
/>

<!-- Beside the boxes rather than inside them: the palette floats over the whole
     page, and no container is its parent. Closed until Ctrl/Cmd+K. -->
<QuickJump pages={data.pages} services={data.services} />
