import type { ConfigContainer } from '$lib/business/model/config';
import type { ServicesStore } from '$lib/business/store/service-store.svelte';
import { collectServiceProbes } from '$lib/business/model/config';

const POLL_INTERVAL_MS = 1000 * 60 * 15;

/**
 * What a poll would measure, as a SCALAR an `$effect` can depend on. `containers` is a
 * freshly deserialized array after every navigation — the stats refresh used to re-run
 * the load every 60s too, which is what originally tore the 15-minute poll down and
 * started a new one, with its eager first tick, once a minute. A list would carry the
 * same defect: a new array is a new identity even when the hrefs are the same. Only a
 * navigation that actually changes the boxes changes what this returns.
 *
 * Already deduped by `collectServiceProbes`, which is where that rule lives — and which
 * also drops `probe: 'none'`, so a bookmark is never measured.
 */
export function serviceProbeKey(containers: ConfigContainer[]): string {
	return collectServiceProbes(containers)
		.map(({ href }) => href)
		.join('\n');
}

export function pollServicesState(servicesStore: ServicesStore, probeKey: string): () => void {
	// The probe mode is not carried through: the server resolves it from the file, because
	// that endpoint is unauthenticated and a client-chosen probe would be a client-chosen
	// behaviour. A URL cannot hold a newline, so the join above is reversible.
	const hrefs = probeKey ? probeKey.split('\n') : [];
	// A probe outlives the page that started it. Aborting on teardown is what keeps a slow
	// answer from the previous page out of the store — it would sit there for the next 15
	// minutes — and stops a failure toasting a page the user has already left.
	const controller = new AbortController();
	let lastPolledAt = 0;

	function poll(): void {
		// A hidden tab is nobody reading, the same guard the stats refresh in
		// `[...slug]/+page.svelte` carries. Background throttling is not the same as not
		// firing: an 8-hour stint still delivers ~32 ticks, which for a dozen services is
		// hundreds of round trips, each with a diagnostic and a toast waiting for a reader
		// who is not there.
		if (document.hidden) {
			return;
		}

		lastPolledAt = Date.now();
		hrefs.forEach((href) => servicesStore.refresh(href, controller.signal));
	}

	// Timers do not fire while the OS is suspended and browsers freeze background tabs, and
	// `setInterval` does not catch up — so a resumed tab would keep asserting a measurement
	// hours old until the next tick. Both signals are needed: on desktop, switching to
	// another application leaves `visibilityState` at `visible`, so `focus` is the only one
	// that fires there, while a tab switch within the browser raises `visibilitychange`.
	//
	// A wake is a user action, so the bound has to be "was a tick missed" rather than the
	// wake itself: unguarded, the re-poll rate is however often somebody changes windows,
	// and a dismissed probe failure comes straight back — `ToastStore` dedupes against what
	// is currently on SCREEN. This is also what makes both events firing on one return a
	// single poll instead of a duplicate round trip.
	function onWake(): void {
		if (Date.now() - lastPolledAt < POLL_INTERVAL_MS) {
			return;
		}

		poll();
	}

	// A page loaded into a background tab skips this one, and the wake listeners below are
	// what cover it on the way back.
	poll();

	const id = setInterval(poll, POLL_INTERVAL_MS);

	document.addEventListener('visibilitychange', onWake);
	window.addEventListener('focus', onWake);

	return () => {
		clearInterval(id);
		controller.abort();
		document.removeEventListener('visibilitychange', onWake);
		window.removeEventListener('focus', onWake);
	};
}
