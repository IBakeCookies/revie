import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getUptimeKumaStats } from '$lib/data/repository/uptime-kuma';

const input = {
	href: 'http://kuma.local/status/home',
	// The read's budget is minted by business and handed down, so these cases only need a
	// signal that exists. Short enough that a leaked real fetch dies.
	signal: AbortSignal.timeout(50),
};

const heartbeats = {
	heartbeatList: {
		'1': [
			{
				status: 1,
				time: '2026-08-17 12:00:00',
				msg: '',
				ping: 12,
			},
		],
	},
	uptimeList: {
		'1_24': 0.99,
	},
};

function stubFetch(response: Partial<Response>): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async () => response as Response);

	vi.stubGlobal('fetch', fetchMock);

	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('$getUptimeKumaStats', () => {
	// The slug is the href's last segment rather than a prop of its own: a status page url
	// already carries it, and a second prop is a second thing to get wrong.
	it('asks the heartbeat endpoint for the slug the status page href ends in', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => heartbeats,
		});

		const [err, res] = await $getUptimeKumaStats(input);

		expect(err).toBeNull();

		// Only `status` comes back: the schema names it alone, and valibot's output drops
		// what nobody declared — so the projection cannot read a field nothing validated.
		expect(res).toEqual({
			heartbeatList: {
				'1': [
					{
						status: 1,
					},
				],
			},
			uptimeList: {
				'1_24': 0.99,
			},
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'http://kuma.local/api/status-page/heartbeat/home',
			expect.anything(),
		);
	});

	it('uses the signal it was given rather than minting one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => heartbeats,
		});

		await $getUptimeKumaStats(input);

		expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
	});

	// A bare origin is the Kuma dashboard, not a status page. Answered here rather than as
	// Kuma's own 404, which says nothing about which half of the href is wrong.
	it('refuses an href with no slug in it without asking Uptime Kuma', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => heartbeats,
		});

		const [err, res] = await $getUptimeKumaStats({
			...input,
			href: 'http://kuma.local/',
		});

		expect(res).toBeNull();
		expect(err?.message).toContain('href must be the status page URL');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('names the status in the message the log gets', async () => {
		stubFetch({
			ok: false,
			status: 404,
			statusText: 'Not Found',
			json: async () => ({}),
		});

		const [err] = await $getUptimeKumaStats(input);

		expect(err?.message).toContain('Uptime Kuma responded with 404 Not Found');
	});

	// The projection runs outside the error-as-value boundary, so a body it cannot read has
	// to fail here — otherwise one malformed 200 is a TypeError that 500s the whole page.
	it('reports a 200 whose heartbeat list is not a list as an error', async () => {
		stubFetch({
			ok: true,
			json: async () => ({
				heartbeatList: {
					'1': {},
				},
				uptimeList: {},
			}),
		});

		const [err, res] = await $getUptimeKumaStats(input);

		expect(res).toBeNull();
		expect(err?.message).toContain('is not stats');
	});

	it('reports a network failure as an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('ECONNREFUSED');
			}),
		);

		const [err] = await $getUptimeKumaStats(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
