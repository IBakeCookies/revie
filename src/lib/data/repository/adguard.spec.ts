import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getAdguardStats } from '$lib/data/repository/adguard';

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
	vi.restoreAllMocks();
});

describe('$getAdguardStats', () => {
	it('asks the stats endpoint with basic auth', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => stats,
		});

		const [err, res] = await $getAdguardStats(input);

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

	it('bounds the request at 3s, so an unreachable host cannot stall the page load', async () => {
		// Asserting the timeout VALUE, not just that a signal exists: AbortSignal.timeout
		// runs on an internal timer no fake clock reaches, so an "is it aborted yet"
		// assertion passes at any bound, including none worth having.
		const timeout = vi.spyOn(AbortSignal, 'timeout');

		const fetchMock = stubFetch({
			ok: true,
			json: async () => stats,
		});

		await $getAdguardStats(input);

		expect(timeout).toHaveBeenCalledWith(3000);
		expect(fetchMock.mock.calls[0][1].signal).toBe(timeout.mock.results[0].value);
	});

	it('names the status in the message the log gets', async () => {
		stubFetch({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			json: async () => ({}),
		});

		const [err] = await $getAdguardStats(input);

		expect(err?.message).toContain('AdGuard responded with 401 Unauthorized');
	});

	it('reports an unauthorized response as an error instead of parsing it', async () => {
		stubFetch({
			ok: false,
			status: 403,
			statusText: 'Forbidden',
			json: async () => ({}),
		});

		const [err, res] = await $getAdguardStats(input);

		expect(res).toBeNull();
		expect((err?.cause as Error).message).toBe('AdGuard responded with 403 Forbidden');
	});

	it('reports a 200 carrying null as an error instead of letting it reach the projection', async () => {
		stubFetch({
			ok: true,
			json: async () => null,
		});

		const [err, res] = await $getAdguardStats(input);

		expect(res).toBeNull();

		expect(err?.message).toContain('answered 200 with a body that is not stats');
	});

	it('reports a 200 carrying an error object as an error, so no reading renders NaN', async () => {
		stubFetch({
			ok: true,
			json: async () => ({
				message: 'unauthorized',
			}),
		});

		const [err, res] = await $getAdguardStats(input);

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

		const [err] = await $getAdguardStats(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
