import { getContext, setContext } from 'svelte';
import { readServiceState } from '$lib/business/service';
import type { AppError } from '$lib/utils/useAsyncErrorAsValue';

const CONTEXT_KEY = Symbol();

/**
 * Where a failure goes once the store has decided what it means for the state.
 * Defaults to the console; pass a toast store's reporter to show it to the user
 * instead. This is the seam that keeps error REPORTING out of the store, the
 * business layer and the repository.
 */
export type ErrorReporter = (error: AppError) => void;

const reportToConsole: ErrorReporter = (error) => console.error(error.message, error.cause ?? '');

export class ServicesStore {
	/** Keyed by href so a refresh replaces the previous result instead of stacking up. */
	#states = $state<Record<string, boolean>>({});
	#report: ErrorReporter;

	constructor(report: ErrorReporter = reportToConsole) {
		this.#report = report;
	}

	isAlive(href: string): boolean | null {
		return this.#states[href] ?? null;
	}

	async refresh(href: string): Promise<void> {
		const [err, isAlive] = await readServiceState(href);

		if (err) {
			// The probe failed, which says nothing about the service — keep the last
			// known state rather than showing a false offline dot, and hand the error
			// on so it is reported rather than swallowed.
			this.#report(err);

			return;
		}

		this.#states[href] = isAlive;
	}
}

export function setServicesStore(report?: ErrorReporter): ServicesStore {
	return setContext<ServicesStore>(CONTEXT_KEY, new ServicesStore(report));
}

export function getServicesStore(): ServicesStore {
	return getContext<ServicesStore>(CONTEXT_KEY);
}
