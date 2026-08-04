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

		expect(store.refresh).toHaveBeenCalledExactlyOnceWith('https://proxmox.local');
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
