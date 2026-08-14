import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getServiceState } from '$lib/data/repository/service';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('$getServiceState', () => {
	it('posts the href to the ping endpoint', async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				isAlive: true,
			}),
		}));

		vi.stubGlobal('fetch', fetchMock);

		const [err, res] = await $getServiceState('http://wled.local');

		expect(err).toBeNull();

		expect(res).toEqual({
			isAlive: true,
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'/api/ping',
			expect.objectContaining({
				method: 'POST',
				signal: expect.any(AbortSignal),
				body: JSON.stringify({
					href: 'http://wled.local',
				}),
			}),
		);
	});

	it('reports a rejected ping as an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: false,
				status: 403,
				statusText: 'Forbidden',
			})),
		);

		const [err, res] = await $getServiceState('http://not-configured.local');

		expect(res).toBeNull();
		expect((err?.cause as Error).message).toBe('Ping responded with 403 Forbidden');
	});

	it('names the service it could not reach, and keeps the thrown reason', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				// what undici throws for an unreachable host: it names no service
				throw new TypeError('fetch failed');
			}),
		);

		const [err] = await $getServiceState('http://wled.local');

		expect(err?.message).toBe('Could not reach http://wled.local: fetch failed');
	});
});
