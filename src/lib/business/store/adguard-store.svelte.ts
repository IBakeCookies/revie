import { type AdguardStats } from '$lib/business/type/adguard-stats';
import { getContext, setContext } from 'svelte';

const CONTEXT_KEY = Symbol();

/**
 * Read-only view over the stats loaded on the server. A getter is used instead of
 * local state so that boxes instantiated from config stay in sync with the page
 * data across client-side navigations.
 */
export class AdguardStore {
	#stats: () => AdguardStats | undefined;

	constructor(stats: () => AdguardStats | undefined) {
		this.#stats = stats;
	}

	get stats(): AdguardStats | undefined {
		return this.#stats();
	}
}

export function setAdguardStore(stats: () => AdguardStats | undefined): AdguardStore {
	return setContext<AdguardStore>(CONTEXT_KEY, new AdguardStore(stats));
}

/** `undefined` wherever no component above set the store — a story mounting a wrapper alone. */
export function getAdguardStore(): AdguardStore | undefined {
	return getContext<AdguardStore | undefined>(CONTEXT_KEY);
}
