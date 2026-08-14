import type { ConfigContainer } from '$lib/business/model/config';
import type { ServicesStore } from '$lib/business/store/service-store.svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollServicesState } from '$lib/business/store/poll-services-state';

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

function fakeStore(): ServicesStore {
	return {
		refresh: vi.fn(),
		isAlive: vi.fn(),
	} as unknown as ServicesStore;
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('pollServicesState', () => {
	it('refreshes every service href immediately', () => {
		const store = fakeStore();

		pollServicesState(store, containers);

		expect(store.refresh).toHaveBeenCalledExactlyOnceWith(
			'https://proxmox.local',
			expect.any(AbortSignal),
		);
	});

	it('probes a href named twice by the config only once', () => {
		const store = fakeStore();

		// Two probes of one endpoint per tick is two round trips for one answer. The
		// dedupe lives in `collectServiceHrefs`; this holds it at the seam that needs it.
		pollServicesState(store, [...containers, ...containers]);

		expect(store.refresh).toHaveBeenCalledTimes(1);
	});

	it('aborts the probes it started once the returned teardown runs', () => {
		const store = fakeStore();
		const stop = pollServicesState(store, containers);
		const [, signal] = vi.mocked(store.refresh).mock.calls[0];

		expect(signal?.aborted).toBe(false);

		stop();

		// A probe still in flight resolves into an aborted signal, so it can neither
		// write over the page that replaced this one nor toast it.
		expect(signal?.aborted).toBe(true);
	});

	it('keeps refreshing on the interval', () => {
		const store = fakeStore();

		pollServicesState(store, containers);
		vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);

		expect(store.refresh).toHaveBeenCalledTimes(3);
	});

	it('stops polling once the returned teardown runs', () => {
		const store = fakeStore();

		pollServicesState(store, containers)();
		vi.advanceTimersByTime(POLL_INTERVAL_MS * 2);

		expect(store.refresh).toHaveBeenCalledTimes(1);
	});
});
