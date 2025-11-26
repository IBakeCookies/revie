import { type GetAdguardStatsOutput } from '$lib/data/repository/adguard';
import { type AdguardStats } from '$lib/business/type/adguard-stats';
import { getContext, setContext } from 'svelte';
import { transformAdguardStats } from '$lib/business/transform/adguard-transform';

const CONTEXT_KEY = Symbol();

export class AdguardStore {
	#stats: AdguardStats | undefined = $state();

	get stats() {
		return this.#stats;
	}

	setStats(stats: GetAdguardStatsOutput) {
		this.#stats = transformAdguardStats(stats);
	}
}

export function setAdguardStore(eventStore = new AdguardStore()): AdguardStore {
	return setContext<AdguardStore>(CONTEXT_KEY, eventStore);
}

export function getAdguardStore(): AdguardStore {
	return getContext<AdguardStore>(CONTEXT_KEY);
}
