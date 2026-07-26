import { getContext, setContext } from 'svelte';
import { getServiceState } from '$lib/data/repository/service';

const CONTEXT_KEY = Symbol();

export class ServicesStore {
	/** Keyed by href so a refresh replaces the previous result instead of stacking up. */
	#states = $state<Record<string, boolean>>({});

	isAlive(href: string): boolean | null {
		return this.#states[href] ?? null;
	}

	async refresh(href: string): Promise<void> {
		const [err, res] = await getServiceState(href);

		if (err) {
			console.error(`Service state for ${href} could not be read:`, err);

			return;
		}

		this.#states[href] = res.isAlive;
	}
}

export function setServicesStore(): ServicesStore {
	return setContext<ServicesStore>(CONTEXT_KEY, new ServicesStore());
}

export function getServicesStore(): ServicesStore {
	return getContext<ServicesStore>(CONTEXT_KEY);
}
