import type { ConfigContainer } from '$lib/business/config';
import type { ServicesStore } from '$lib/presentation/store/service-store.svelte';
import { collectServiceHrefs } from '$lib/business/config';

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
