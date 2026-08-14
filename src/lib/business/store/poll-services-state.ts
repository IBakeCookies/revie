import type { ConfigContainer } from '$lib/business/model/config';
import type { ServicesStore } from '$lib/business/store/service-store.svelte';
import { collectServiceHrefs } from '$lib/business/model/config';

const POLL_INTERVAL_MS = 1000 * 60 * 15;

export function pollServicesState(
	servicesStore: ServicesStore,
	containers: ConfigContainer[],
): () => void {
	// Already deduped by `collectServiceHrefs`, which is where that rule lives.
	const hrefs = collectServiceHrefs(containers);
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
