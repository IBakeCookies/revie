import { describe, expect, it, vi } from 'vitest';
import { readServiceState } from '$lib/business/model/service';
import { ServicesStore } from '$lib/business/store/service-store.svelte';

// Mocked at the store's own boundary: business. Whether a failed probe means
// "offline" or "undetermined" is business's call and is tested next to it.
vi.mock('$lib/business/model/service', () => ({ readServiceState: vi.fn() }));

const href = 'http://wled.local';

describe('ServicesStore', () => {
	it('reports an unknown state until the first refresh', () => {
		expect(new ServicesStore().isAlive(href)).toBeNull();
	});

	it('keeps the state of each service apart', async () => {
		const store = new ServicesStore();

		vi.mocked(readServiceState).mockResolvedValue([null, true]);
		await store.refresh(href);

		vi.mocked(readServiceState).mockResolvedValue([null, false]);
		await store.refresh('http://emqx.local');

		expect(store.isAlive(href)).toBe(true);
		expect(store.isAlive('http://emqx.local')).toBe(false);
	});

	it('replaces the previous result instead of stacking up', async () => {
		const store = new ServicesStore();

		vi.mocked(readServiceState).mockResolvedValue([null, true]);
		await store.refresh(href);

		vi.mocked(readServiceState).mockResolvedValue([null, false]);
		await store.refresh(href);

		expect(store.isAlive(href)).toBe(false);
	});

	it('leaves the last known state alone when the probe fails', async () => {
		const report = vi.fn();
		const store = new ServicesStore(report);

		vi.mocked(readServiceState).mockResolvedValue([null, true]);
		await store.refresh(href);

		vi.mocked(readServiceState).mockResolvedValue([{ message: 'Could not reach' }, null]);
		await store.refresh(href);

		expect(store.isAlive(href)).toBe(true);
	});

	it('reports the failure instead of swallowing it, with a renderable message', async () => {
		const report = vi.fn();
		const store = new ServicesStore(report);
		const error = { message: `Could not reach ${href}`, cause: new Error('fetch failed') };

		vi.mocked(readServiceState).mockResolvedValue([error, null]);
		await store.refresh(href);

		expect(report).toHaveBeenCalledWith(error);
		// what a toast would render — never undefined
		expect(report.mock.calls[0][0].message).toBe(`Could not reach ${href}`);
	});

	it('logs to the console when no reporter is given', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = new ServicesStore();

		vi.mocked(readServiceState).mockResolvedValue([{ message: 'boom' }, null]);
		await store.refresh(href);

		expect(consoleError).toHaveBeenCalledOnce();
	});
});
