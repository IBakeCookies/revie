import { type AdguardStats } from '$lib/business/type/adguard-stats';
import { getContext, setContext } from 'svelte';

const CONTEXT_KEY = Symbol();

export class AdguardStore {
	stats = $state<AdguardStats | undefined>();
}

export function setAdguardStore(): AdguardStore {
	return setContext<AdguardStore>(CONTEXT_KEY, new AdguardStore());
}

export function getAdguardStore(): AdguardStore {
	return getContext<AdguardStore>(CONTEXT_KEY);
}
