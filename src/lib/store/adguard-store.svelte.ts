import { type GetAdguardStatsOutput } from '$lib/data/repository/adguard';
import { type AdguardStats } from '$lib/business/type/adguard-stats';
import { getContext, setContext } from 'svelte';
import { transformAdguardStats } from '$lib/business/transform/adguard-transform';

const CONTEXT_KEY = Symbol();

export class AdguardStore {
	#stats = $state<AdguardStats | undefined>();

	constructor(stats: GetAdguardStatsOutput) {
		this.#stats = transformAdguardStats(stats);
	}

	get stats() {
		return this.#stats;
	}
}

export function setAdguardStore(stats: GetAdguardStatsOutput): AdguardStore {
	return setContext<AdguardStore>(CONTEXT_KEY, new AdguardStore(stats));
}

export function getAdguardStore(): AdguardStore {
	return getContext<AdguardStore>(CONTEXT_KEY);
}
