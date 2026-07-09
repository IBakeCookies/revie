import type { ConfigContainer } from '$lib/utils/config';
import { isBoxService, isGrid } from '$lib/utils/config';
import { getContext, setContext } from 'svelte';
import { getServiceState } from '$lib/data/repository/service';

interface ServiceState {
	href: string;
	isAlive: boolean;
}

const CONTEXT_KEY = Symbol();

export class ServicesStore {
	services = $state<ServiceState[]>([]);

	async getServiceStatus(href: string): Promise<void> {
		const [err, res] = await getServiceState(href);

		if (err) {
			console.error('Service fetch error:', err);

			return;
		}

		this.services.push({
			href,
			isAlive: res.isAlive
		});
	}

	getServicesHrefs(items: ConfigContainer[]) {
		const hrefs: string[] = [];

		for (const item of items) {
			if (isBoxService(item)) {
				hrefs.push(item.props.href);
			}

			if (isGrid(item) && item.props.items) {
				hrefs.push(...this.getServicesHrefs(item.props.items));
			}
		}

		return hrefs;
	}
}

export function setServicesStore(): ServicesStore {
	return setContext<ServicesStore>(CONTEXT_KEY, new ServicesStore());
}

export function getServicesStore(): ServicesStore {
	return getContext<ServicesStore>(CONTEXT_KEY);
}
