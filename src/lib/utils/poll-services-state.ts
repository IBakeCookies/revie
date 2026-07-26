import type { ConfigContainer } from '$lib/utils/config';
import type { ServicesStore } from '$lib/store/service-store.svelte';
import { collectServiceHrefs } from '$lib/utils/config';

const POLL_INTERVAL_MS = 1000 * 60 * 15;

export function pollServicesState(
	servicesStore: ServicesStore,
	containers: ConfigContainer[]
): () => void {
	const hrefs = collectServiceHrefs(containers);

	function poll(): void {
		hrefs.forEach((href) => servicesStore.refresh(href));
	}

	poll();

	const id = setInterval(poll, POLL_INTERVAL_MS);

	return () => {
		clearInterval(id);
	};
}
