import { getContext, setContext } from 'svelte';
import { readServiceState } from '$lib/business/model/service';

const CONTEXT_KEY = Symbol();

/**
 * Says a probe of this href failed, so presentation can tell the user. It carries the
 * href and **no words**: raising a toast is presentation's job, and so is the copy.
 * The `AppError`'s own message is a developer detail in one language, which is why it
 * goes to the log below and never through here.
 *
 * Ported from zenith, where every such seam is a zero-argument thunk
 * (`NotifyHistoryLoadFailed`) and a variant is a kind, never a string. The href is
 * data rather than copy, so passing it is what lets the message name the service.
 */
export type NotifyProbeFailed = (href: string) => void;

export class ServicesStore {
	/** Keyed by href so a refresh replaces the previous result instead of stacking up. */
	#states = $state<Record<string, boolean>>({});
	#notify: NotifyProbeFailed;

	/** No-op by default: the log below fires either way, so nothing is swallowed. */
	constructor(notify: NotifyProbeFailed = () => {}) {
		this.#notify = notify;
	}

	isAlive(href: string): boolean | null {
		return this.#states[href] ?? null;
	}

	async refresh(href: string): Promise<void> {
		const [err, isAlive] = await readServiceState(href);

		if (err) {
			// The probe failed, which says nothing about the service — keep the last
			// known state rather than showing a false offline dot.
			//
			// Two channels, and the split is the point. `err.message` ("fetch failed")
			// is for whoever is reading a log, so it stays here unconditionally rather
			// than being injected: it is a diagnostic, not a report. The notify is the
			// injected half, and it hands over the href alone.
			console.error(err.message, err.cause ?? '');
			this.#notify(href);

			return;
		}

		this.#states[href] = isAlive;
	}
}

export function setServicesStore(notify?: NotifyProbeFailed): ServicesStore {
	return setContext<ServicesStore>(CONTEXT_KEY, new ServicesStore(notify));
}

export function getServicesStore(): ServicesStore {
	return getContext<ServicesStore>(CONTEXT_KEY);
}
