import type { ConfigContainer } from '$lib/business/model/config';
import type { ServicesStore } from '$lib/business/store/service-store.svelte';
import { collectServiceProbes } from '$lib/business/model/config';

const POLL_INTERVAL_MS = 1000 * 60 * 15;

/**
 * What a poll would measure, as a SCALAR an `$effect` can depend on. `containers` is a
 * freshly deserialized array after every load re-run, and the stats refresh re-runs the
 * load every 60s — so an effect tracking the array tore the 15-minute poll down and
 * started a new one, with its eager first tick, once a minute. A list would carry the
 * same defect: a new array is a new identity even when the hrefs are the same. Only a
 * navigation changes what this returns.
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

	function poll(): void {
		hrefs.forEach((href) => servicesStore.refresh(href, controller.signal));
	}

	poll();

	const id = setInterval(poll, POLL_INTERVAL_MS);

	return () => {
		clearInterval(id);
		controller.abort();
	};
}
