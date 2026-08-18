import type { ProviderName } from '$lib/business/model/config';
import type { Stat } from '$lib/business/type/stats';
import { getContext, setContext } from 'svelte';
import { statsKey } from '$lib/business/model/config';

const CONTEXT_KEY = Symbol();

/**
 * Read-only view over the stats loaded on the server. A thunk is held instead of local
 * state so that boxes instantiated from config stay in sync with the page data across
 * client-side navigations and across the stats refresh.
 */
export class StatsStore {
	#stats: () => Record<string, Stat[]>;

	constructor(stats: () => Record<string, Stat[]>) {
		this.#stats = stats;
	}

	/**
	 * The readings are keyed by provider AND href — a box asks for what IT was configured
	 * with — and an absent key is the whole seam: it means this instance was never read,
	 * or was read and did not answer, and the box renders its unavailable line either way.
	 */
	stats(provider: ProviderName, href: string): Stat[] | undefined {
		const stats = this.#stats();
		const key = statsKey(provider, href);

		// `Object.hasOwn` for the same reason `isContainerName` uses it: the key is built
		// from `config.json`, and a plain record answers `constructor` with
		// `Object.prototype.constructor` — truthy, so the box would render garbage instead
		// of saying it has nothing.
		return Object.hasOwn(stats, key) ? stats[key] : undefined;
	}
}

export function setStatsStore(stats: () => Record<string, Stat[]>): StatsStore {
	return setContext<StatsStore>(CONTEXT_KEY, new StatsStore(stats));
}

/** `undefined` wherever no component above set the store — a story mounting a wrapper alone. */
export function getStatsStore(): StatsStore | undefined {
	return getContext<StatsStore | undefined>(CONTEXT_KEY);
}
