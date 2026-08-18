import { getContext, setContext, untrack } from 'svelte';

const CONTEXT_KEY = Symbol();
/** Long enough to read a line, short enough that a stale failure clears itself. */
const TOAST_MS = 6_000;

/**
 * The queue behind the toast region. It takes a **finished string** and holds no
 * opinion about where the words came from — which is the whole reason it can live in
 * business: nothing here names a message, a locale or a component.
 *
 * The words are chosen by whoever calls `show`, in presentation, from a paraglide
 * message. Nothing below presentation may hand a message in: an `AppError.message`
 * is minted in `data`/`business` (`fetch failed`, `AdGuard responded with 401
 * Unauthorized`) and is a developer detail in one language. Those go to the log; the
 * store that caught them passes on DATA (an href, a kind) and presentation turns
 * that into copy. Ported from zenith, whose seams are `() => void` for exactly this
 * reason.
 */
export class ToastStore {
	/**
	 * Keyed by message, for the same reason `ServicesStore` keys its states by href:
	 * a dead service is re-probed every 15 minutes and a dashboard tab stays open all
	 * day, so a queue that appended would stack the same line up all afternoon.
	 */
	#messages = $state<string[]>([]);

	/**
	 * The auto-dismiss handle of each shown message, so `dismiss` can cancel it. Keyed
	 * like `#messages` and deliberately NOT reactive — nothing renders a timer, and the
	 * whole point of the `untrack` below is to keep this store out of the effect that
	 * calls into it.
	 */
	#timers: Record<string, ReturnType<typeof setTimeout>> = {};

	get messages(): readonly string[] {
		return this.#messages;
	}

	/**
	 * A bound field, so it can be handed straight to a store as its notify callback.
	 *
	 * The string is resolved at the moment of the failure, so a toast raised before a
	 * language switch keeps the language it was raised in. It outlives the switch by
	 * at most `TOAST_MS`, and re-resolving would mean storing message keys here —
	 * which is the coupling this store exists to avoid.
	 */
	show = (message: string): void => {
		// Untracked, and not defensively: `show` is called FROM an `$effect` (a route
		// forwarding a failure its load returned), and both the dedupe check and `push`
		// READ this array — so the effect subscribed to it and dismissing a toast put it
		// straight back. Reproduced end to end; the e2e in can-see-provider-stats holds
		// it, since `untrack` outside an effect is a pass-through and a node spec cannot
		// register one.
		untrack(() => {
			if (this.#messages.includes(message)) {
				return;
			}

			this.#messages.push(message);

			this.#timers[message] = setTimeout(() => this.dismiss(message), TOAST_MS);
		});
	};

	dismiss(message: string): void {
		// The timer belongs to the message, so it dies with it. Left running, the timer of
		// a dismissed toast went on to clear the NEXT toast of the same line early — show,
		// dismiss a second later, show again, and the second one lasted 5s instead of 6.
		// It is also what stops the handles piling up on a tab left open all day.
		clearTimeout(this.#timers[message]);
		delete this.#timers[message];

		this.#messages = this.#messages.filter((existing) => existing !== message);
	}
}

export function setToastStore(): ToastStore {
	return setContext<ToastStore>(CONTEXT_KEY, new ToastStore());
}

export function getToastStore(): ToastStore {
	return getContext<ToastStore>(CONTEXT_KEY);
}
