import { describe, expect, it, vi } from 'vitest';
import { getServiceState } from '$lib/data/repository/service';
import { readServiceState } from '$lib/business/model/service';

vi.mock('$lib/data/repository/service', () => ({ getServiceState: vi.fn() }));

const href = 'http://wled.local';

describe('readServiceState', () => {
	it('passes a service that answers through as alive', async () => {
		vi.mocked(getServiceState).mockResolvedValue([null, { isAlive: true }]);

		expect(await readServiceState(href)).toEqual([null, true]);
	});

	it('reports offline when the service itself does not answer', async () => {
		vi.mocked(getServiceState).mockResolvedValue([null, { isAlive: false }]);

		expect(await readServiceState(href)).toEqual([null, false]);
	});

	it('returns the error -- not false -- when the probe itself fails', async () => {
		const err = { message: 'Ping responded with 403 Forbidden' };

		vi.mocked(getServiceState).mockResolvedValue([err, null]);

		// A failed probe says nothing about the service, so it must not read as offline.
		expect(await readServiceState(href)).toEqual([err, null]);
	});

	it("does not log or swallow -- reporting is the caller's decision", async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		vi.mocked(getServiceState).mockResolvedValue([{ message: 'boom' }, null]);
		await readServiceState(href);

		expect(consoleError).not.toHaveBeenCalled();
	});
});
