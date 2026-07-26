import { describe, expect, it, vi } from 'vitest';
import { getServiceState } from '$lib/data/repository/service';
import { ServicesStore } from '$lib/store/service-store.svelte';

vi.mock('$lib/data/repository/service', () => ({ getServiceState: vi.fn() }));

const href = 'http://wled.local';

describe('ServicesStore', () => {
	it('reports an unknown state until the first refresh', () => {
		expect(new ServicesStore().isAlive(href)).toBeNull();
	});

	it('keeps the state of each service apart', async () => {
		const store = new ServicesStore();

		vi.mocked(getServiceState).mockResolvedValue([null, { isAlive: true }]);
		await store.refresh(href);

		vi.mocked(getServiceState).mockResolvedValue([null, { isAlive: false }]);
		await store.refresh('http://emqx.local');

		expect(store.isAlive(href)).toBe(true);
		expect(store.isAlive('http://emqx.local')).toBe(false);
	});

	it('replaces the previous result instead of stacking up', async () => {
		const store = new ServicesStore();

		vi.mocked(getServiceState).mockResolvedValue([null, { isAlive: true }]);
		await store.refresh(href);

		vi.mocked(getServiceState).mockResolvedValue([null, { isAlive: false }]);
		await store.refresh(href);

		expect(store.isAlive(href)).toBe(false);
	});

	it('leaves the last known state alone when the ping fails', async () => {
		const store = new ServicesStore();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		vi.mocked(getServiceState).mockResolvedValue([null, { isAlive: true }]);
		await store.refresh(href);

		vi.mocked(getServiceState).mockResolvedValue([{ cause: new Error('offline') }, null]);
		await store.refresh(href);

		expect(store.isAlive(href)).toBe(true);
		expect(error).toHaveBeenCalledOnce();
	});
});
