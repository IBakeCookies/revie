import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdguardStats } from '$lib/data/repository/adguard';

const input = {
	username: 'admin',
	password: 'secret',
	href: 'http://adguard.local',
};

const stats = {
	num_dns_queries: 1,
	num_blocked_filtering: 0,
	avg_processing_time: 0,
	top_blocked_domains: [],
};

function stubFetch(response: Partial<Response>): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async () => response as Response);

	vi.stubGlobal('fetch', fetchMock);

	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('getAdguardStats', () => {
	it('asks the stats endpoint with basic auth', async () => {
		const fetchMock = stubFetch({ ok: true, json: async () => stats });

		const [err, res] = await getAdguardStats(input);

		expect(err).toBeNull();
		expect(res).toEqual(stats);
		expect(fetchMock).toHaveBeenCalledWith(
			'http://adguard.local/control/stats',
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}`,
				}),
			}),
		);
	});

	it('bounds the request, so an unreachable host cannot stall the page load', async () => {
		const fetchMock = stubFetch({ ok: true, json: async () => stats });

		await getAdguardStats(input);

		const { signal } = fetchMock.mock.calls[0][1];

		expect(signal).toBeInstanceOf(AbortSignal);
		expect(signal.aborted).toBe(false);
	});

	it('surfaces a message that is safe to show a user', async () => {
		stubFetch({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) });

		const [err] = await getAdguardStats(input);

		expect(err?.message).toBe('AdGuard responded with 401 Unauthorized');
	});

	it('reports an unauthorized response as an error instead of parsing it', async () => {
		stubFetch({
			ok: false,
			status: 403,
			statusText: 'Forbidden',
			json: async () => ({}),
		});

		const [err, res] = await getAdguardStats(input);

		expect(res).toBeNull();
		expect((err?.cause as Error).message).toBe('AdGuard responded with 403 Forbidden');
	});

	it('reports a network failure as an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('ECONNREFUSED');
			}),
		);

		const [err] = await getAdguardStats(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
