<script lang="ts">
	import type { PageProps } from './$types';
	import Page from '$lib/presentation/components/page.svelte';
	import QuickJump from '$lib/presentation/components/quick-jump.svelte';
	import { getToastStore } from '$lib/business/store/toast-store.svelte';
	import { invalidate } from '$app/navigation';
	import { m } from '$lib/paraglide/messages';
	import { providerNameLabel } from '$lib/presentation/util/provider-name';

	/**
	 * At least the stats cache's own TTL in `business/model/stats.ts` (30s), or a tick
	 * re-runs the load only to be served the same cached reading and the box never moves.
	 * Comfortably above `TOAST_MS` too, so a refusal that keeps failing does not pin its
	 * toast on screen.
	 */
	const REFRESH_INTERVAL_MS = 60_000;

	let { data }: PageProps = $props();

	const toasts = getToastStore();

	/**
	 * Which failures have already been said out loud, by the same key the readings are
	 * recorded under — the stats `statsKey(provider, href)` string, and a feed's bare
	 * href. The two never collide (a stats key always carries its provider prefix), so
	 * one list serves both channels.
	 *
	 * `ToastStore` dedupes against what is CURRENTLY on screen, so it cannot cover this:
	 * a refresh hands down a new `data` object every minute, the effect re-runs, and a
	 * toast the user dismissed — or that timed itself out — would be raised again
	 * forever. Entries are dropped as instances recover, so a box that fails again is
	 * reported again.
	 *
	 * A plain `let`, not `$state`: nothing renders it, and the effect must not depend on
	 * it. A list rather than a `Set` for the same reason —
	 * `svelte/prefer-svelte-reactivity` rejects a mutable built-in `Set` in a component,
	 * and a reactive one is the opposite of what this needs. It holds one entry per box
	 * on the page, so `includes` is right.
	 */
	let reportedFailures: string[] = [];

	// This route is where every failure gets its words. All three stores below hand over
	// data only — a provider and an href from the load, an href from the probe or from
	// the feed read — and the paraglide call is here, in presentation, so every toast
	// follows the user's language.
	//
	// The server can only log, which reaches an operator's journal and nobody looking at
	// the page. This is what tells them WHY a box is empty, and which one; the reason it
	// failed stays in that log, which already names the host and the status.
	//
	// N failing instances raise N toasts, uncapped and on purpose: a summary line is
	// exactly the "true for one, useless for eight" failure this seam exists to fix.
	$effect(() => {
		const failing = [...data.failedStats.map(({ key }) => key), ...data.failedFeeds];

		// Dropped as instances recover, so a box that fails again is reported again.
		reportedFailures = reportedFailures.filter((key) => failing.includes(key));

		for (const failure of data.failedStats) {
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

		for (const href of data.failedFeeds) {
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
	 * page, so an ungated interval spends a load round trip a minute on an install with no
	 * live data at all — for a record that is always empty. A reading that arrived and a
	 * read that failed are the two states worth re-asking; no box configured and a secret
	 * that is not set both read as an absence here, and neither changes without a restart.
	 */
	const refreshable = $derived(
		data.failedStats.length > 0 ||
			Object.keys(data.stats).length > 0 ||
			data.failedFeeds.length > 0 ||
			Object.keys(data.feeds).length > 0,
	);

	// A stats box is the one widget reading live data, and it was loaded once per
	// navigation — a tab left open all day showed yesterday's counters. No eager first
	// tick: the load that mounted this has just run.
	$effect(() => {
		if (!refreshable) {
			return;
		}

		function refresh(): void {
			// A hidden tab is nobody reading. Browsers freeze background timers anyway, so
			// an unguarded interval would not keep up either — it would only spend the
			// server's 3s bound the moment the tab came back.
			if (document.visibilityState === 'visible') {
				invalidate('dashboard:stats');
			}
		}

		const id = setInterval(refresh, REFRESH_INTERVAL_MS);

		return () => clearInterval(id);
	});
</script>

<Page
	containers={data.containers}
	stats={data.stats}
	feeds={data.feeds}
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
