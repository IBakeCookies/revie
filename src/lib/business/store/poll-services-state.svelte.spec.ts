// `*.svelte.spec.ts` is the only pattern the chromium project includes, and this module now
// registers `document` / `window` listeners — so under the node project it would throw on the
// first call. The name is the whole reason it runs somewhere with a DOM; it mounts nothing.
import type { ConfigContainer } from '$lib/business/model/config';
import type { ServicesStore } from '$lib/business/store/service-store.svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollServicesState, serviceProbeKey } from '$lib/business/store/poll-services-state';

const POLL_INTERVAL_MS = 1000 * 60 * 15;

const containers: ConfigContainer[] = [
	{
		name: 'Grid',
		props: {
			items: [
				{
					name: 'BoxService',
					props: {
						title: 'Proxmox',
						href: 'https://proxmox.local',
						img: {
							src: '',
						},
					},
				},
			],
		},
	},
	{
		name: 'BoxDate',
		props: {},
	},
];

/**
 * `hidden` is a prototype getter, so it can only be shadowed — `configurable` is what lets
 * the `afterEach` below delete the shadow and give the real one back.
 */
function setHidden(hidden: boolean): void {
	Object.defineProperty(document, 'hidden', {
		value: hidden,
		configurable: true,
	});
}

function fakeStore(): ServicesStore {
	return {
		refresh: vi.fn(),
		isAlive: vi.fn(),
	} as unknown as ServicesStore;
}

beforeEach(() => {
	vi.useFakeTimers();
	// Every poll is gated on visibility now, so a case that does not say leaves the answer
	// to whatever the runner's own page is doing.
	setHidden(false);
});

afterEach(() => {
	vi.useRealTimers();
	delete (document as { hidden?: boolean }).hidden; // restore prototype getter
});

describe('serviceProbeKey', () => {
	// The regression the key exists to stop: a re-run load hands the page a rebuilt array,
	// and an effect tracking that array restarted the 15-minute poll on the 60s refresh.
	it('is unchanged by a containers array that was rebuilt rather than edited', () => {
		expect(serviceProbeKey(structuredClone(containers))).toBe(serviceProbeKey(containers));
	});
});

describe('pollServicesState', () => {
	it('refreshes every service href immediately', () => {
		const store = fakeStore();

		pollServicesState(store, serviceProbeKey(containers));

		expect(store.refresh).toHaveBeenCalledExactlyOnceWith(
			'https://proxmox.local',
			expect.any(AbortSignal),
		);
	});

	it('probes a href named twice by the config only once', () => {
		const store = fakeStore();

		// Two probes of one endpoint per tick is two round trips for one answer. The
		// dedupe lives in `collectServiceProbes`; this holds it at the seam that needs it.
		pollServicesState(store, serviceProbeKey([...containers, ...containers]));

		expect(store.refresh).toHaveBeenCalledTimes(1);
	});

	it('never polls a probe:none box, which has no state to measure', () => {
		const store = fakeStore();

		pollServicesState(
			store,
			serviceProbeKey([
				{
					name: 'BoxService',
					props: {
						title: 'Bookmark',
						href: 'https://bookmark.local',
						img: {
							src: '',
						},
						probe: 'none',
					},
				},
			]),
		);

		expect(store.refresh).not.toHaveBeenCalled();
	});

	it('aborts the probes it started once the returned teardown runs', () => {
		const store = fakeStore();
		const stop = pollServicesState(store, serviceProbeKey(containers));
		const [, signal] = vi.mocked(store.refresh).mock.calls[0];

		expect(signal?.aborted).toBe(false);

		stop();

		// A probe still in flight resolves into an aborted signal, so it can neither
		// write over the page that replaced this one nor toast it.
		expect(signal?.aborted).toBe(true);
	});

	it('keeps refreshing on the interval while the tab is visible', () => {
		const store = fakeStore();

		pollServicesState(store, serviceProbeKey(containers));
		vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);

		expect(store.refresh).toHaveBeenCalledTimes(3);
	});

	it('never polls on the interval while the tab is hidden', () => {
		const store = fakeStore();

		setHidden(true);
		pollServicesState(store, serviceProbeKey(containers));
		vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);

		// Throttled is not the same as stopped: an 8-hour background stint still delivers
		// ticks, and each one is a round trip per service that nobody is reading. The eager
		// first poll goes with them — the wake listeners are what cover a tab loaded in the
		// background.
		expect(store.refresh).not.toHaveBeenCalled();
	});

	it('stops polling once the returned teardown runs', () => {
		const store = fakeStore();

		pollServicesState(store, serviceProbeKey(containers))();
		vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);

		expect(store.refresh).toHaveBeenCalledTimes(1);
	});

	// The interval is what a suspended OS or a frozen background tab does not deliver, so a
	// resumed tab has to measure again rather than wait out the rest of the window.
	it('polls again when a tab comes back into view after a missed tick', () => {
		const store = fakeStore();

		pollServicesState(store, serviceProbeKey(containers));
		setHidden(true);
		vi.advanceTimersByTime(POLL_INTERVAL_MS);
		setHidden(false);
		document.dispatchEvent(new Event('visibilitychange'));

		expect(store.refresh).toHaveBeenCalledTimes(2);
	});

	it('does not poll when the visibility change is the tab going away', () => {
		const store = fakeStore();

		pollServicesState(store, serviceProbeKey(containers));
		setHidden(true);
		// Past the window on purpose, so what refuses this one is the visibility check and
		// not the elapsed check the case below covers.
		vi.advanceTimersByTime(POLL_INTERVAL_MS);
		document.dispatchEvent(new Event('visibilitychange'));

		expect(store.refresh).toHaveBeenCalledTimes(1);
	});

	it('polls again when the window regains focus after a missed tick', () => {
		const store = fakeStore();

		pollServicesState(store, serviceProbeKey(containers));
		// `setSystemTime` moves the clock without firing the interval, which is the suspended
		// OS this path is for: the wall clock advanced and the tick never arrived.
		vi.setSystemTime(Date.now() + POLL_INTERVAL_MS);
		// Switching back from another application never changes `visibilityState`, so on
		// desktop this is the only signal that the tab is being looked at again.
		window.dispatchEvent(new Event('focus'));

		expect(store.refresh).toHaveBeenCalledTimes(2);
	});

	it('does not poll on a wake while the last poll is still inside the window', () => {
		const store = fakeStore();

		pollServicesState(store, serviceProbeKey(containers));
		vi.advanceTimersByTime(POLL_INTERVAL_MS / 2);
		window.dispatchEvent(new Event('focus'));

		// A wake is a user action, so without the elapsed check the re-poll rate is however
		// often somebody changes windows — and `ToastStore` dedupes against what is on
		// screen, so a probe failure they dismissed comes straight back.
		expect(store.refresh).toHaveBeenCalledTimes(1);
	});

	it('stops waking on both signals once the returned teardown runs', () => {
		const store = fakeStore();
		const stop = pollServicesState(store, serviceProbeKey(containers));

		// Past the window, so a listener left behind would poll.
		vi.setSystemTime(Date.now() + POLL_INTERVAL_MS);
		stop();
		document.dispatchEvent(new Event('visibilitychange'));
		window.dispatchEvent(new Event('focus'));

		// A listener left behind outlives the page that registered it, so it would keep
		// probing — and writing into a store the next page has already replaced.
		expect(store.refresh).toHaveBeenCalledTimes(1);
	});
});
