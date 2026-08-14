import { describe, expect, it, vi } from 'vitest';
import { readServiceState } from '$lib/business/model/service';
import { ServicesStore } from '$lib/business/store/service-store.svelte';

// Mocked at the store's own boundary: business. Whether a failed probe means
// "offline" or "undetermined" is business's call and is tested next to it.
vi.mock('$lib/business/model/service', () => ({
	readServiceState: vi.fn(),
}));

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
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = new ServicesStore(vi.fn());

		vi.mocked(readServiceState).mockResolvedValue([null, true]);
		await store.refresh(href);

		vi.mocked(readServiceState).mockResolvedValue([
			{
				message: 'Could not reach',
			},
			null,
		]);

		await store.refresh(href);

		expect(store.isAlive(href)).toBe(true);
	});

	it('tells presentation WHICH href failed, and hands over no words', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const notify = vi.fn();
		const store = new ServicesStore(notify);

		vi.mocked(readServiceState).mockResolvedValue([
			{
				message: `Could not reach ${href}`,
				cause: new Error('fetch failed'),
			},
			null,
		]);

		await store.refresh(href);

		// The href and nothing else. `AppError.message` is English minted in `data`, so
		// letting it through here is what put an untranslatable line in front of a user.
		expect(notify).toHaveBeenCalledWith(href);
	});

	it('says nothing at all when the probe succeeds', async () => {
		const notify = vi.fn();
		const store = new ServicesStore(notify);

		vi.mocked(readServiceState).mockResolvedValue([null, true]);
		await store.refresh(href);

		// Without this, moving the notify out of the failure branch toasts every healthy
		// service on every 15-minute poll and no other case notices.
		expect(notify).not.toHaveBeenCalled();
	});

	it('drops the answer of a probe whose page went away mid-flight', async () => {
		const store = new ServicesStore();
		const controller = new AbortController();

		vi.mocked(readServiceState).mockResolvedValue([null, true]);
		// The teardown ran while the probe was out; the check is after the await either way.
		controller.abort();
		await store.refresh(href, controller.signal);

		expect(store.isAlive(href)).toBeNull();
	});

	it('does not report a failure to a page the user has already left', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const notify = vi.fn();
		const store = new ServicesStore(notify);
		const controller = new AbortController();

		vi.mocked(readServiceState).mockResolvedValue([
			{
				message: 'boom',
			},
			null,
		]);

		controller.abort();
		await store.refresh(href, controller.signal);

		expect(notify).not.toHaveBeenCalled();
		// Still logged: the diagnostic has a fixed sink, so nothing is swallowed.
		expect(consoleError).toHaveBeenCalledWith('boom', '');
	});

	it('logs the technical detail either way, so nothing is swallowed', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const store = new ServicesStore();

		vi.mocked(readServiceState).mockResolvedValue([
			{
				message: 'boom',
			},
			null,
		]);

		await store.refresh(href);

		// No notify was injected — a story mounts the page that way — and the diagnostic
		// still reaches a log. That is why the default may be a no-op.
		expect(consoleError).toHaveBeenCalledWith('boom', '');
	});
});
