import type { ConfigContainer } from '$lib/utils/config';
import { isBoxService, isGrid } from '$lib/utils/config';

interface ServiceState {
	href: string;
	isAlive: boolean;
}

export const boxServiceStore = $state<ServiceState[]>([]);

export async function getServiceState(href: string) {
	const raw = await fetch('/api/ping', {
		method: 'POST',
		body: JSON.stringify({
			href
		})
	});

	const data = await raw.json();

	return data.isAlive;
}

export function collectServiceHrefs(items: ConfigContainer[]): string[] {
	const hrefs: string[] = [];

	for (const item of items) {
		if (isBoxService(item)) {
			hrefs.push(item.props.href);
		}

		if (isGrid(item) && item.props.items) {
			hrefs.push(...collectServiceHrefs(item.props.items));
		}
	}

	return hrefs;
}
