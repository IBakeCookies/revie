import type { TransformConfigOutput } from '$lib/utils/config';
import { getServicesStore } from '$lib/store/service-store.svelte';

export function pollServicesState(containers: TransformConfigOutput[]): () => void {
	const servicesStore = getServicesStore();
	const hrefs = servicesStore.getServicesHrefs(containers);

	function poll() {
		hrefs.forEach(servicesStore.getServiceStatus, servicesStore);
	}

	poll();

	const id = setInterval(poll, 1000 * 60 * 15);

	return () => {
		clearInterval(id);
	};
}
