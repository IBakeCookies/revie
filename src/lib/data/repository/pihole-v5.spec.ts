import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getPiholeV5Stats } from '$lib/data/repository/pihole-v5';

const input = {
	href: 'http://pi.hole',
	credential: 'a1b2c3',
	// The read's budget is minted by business and handed down, so these cases only need a
	// signal that exists. Short enough that a leaked real fetch dies.
	signal: AbortSignal.timeout(50),
};

const summary = {
	dns_queries_today: 1234,
	ads_blocked_today: 56,
	ads_percentage_today: 4.5,
	domains_being_blocked: 104756,
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

describe('$getPiholeV5Stats', () => {
	it('asks the raw summary with the token in the query, and refuses to follow a redirect', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => summary,
		});

		const [err, res] = await $getPiholeV5Stats(input);

		expect(err).toBeNull();
		expect(res).toEqual(summary);

		expect(fetchMock).toHaveBeenCalledWith(
			'http://pi.hole/admin/api.php?summaryRaw=&auth=a1b2c3',
			// `redirect: 'manual'` is the assertion: the token is in the URL, so a followed
			// redirect hands it to a host the operator never configured.
			expect.objectContaining({
				redirect: 'manual',
			}),
		);
	});

	it('uses the signal it was given rather than minting one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => summary,
		});

		await $getPiholeV5Stats(input);

		expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
	});

	// An instance with no password set answers without a token, so a box naming no secret
	// must not send an empty `auth` that the API would then reject.
	it('leaves the token out entirely when no credential was resolved', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => summary,
		});

		await $getPiholeV5Stats({
			...input,
			credential: undefined,
		});

		expect(fetchMock.mock.calls[0][0]).toBe('http://pi.hole/admin/api.php?summaryRaw=');
	});

	/**
	 * The one that matters on this API: a rejected token is a 200 carrying `[]`, not a 401,
	 * so without the wire check a wrong token renders an empty box and says nothing anywhere.
	 */
	it('reports the empty array a rejected token answers with as an error', async () => {
		stubFetch({
			ok: true,
			json: async () => [],
		});

		const [err, res] = await $getPiholeV5Stats(input);

		expect(res).toBeNull();
		expect(err?.message).toContain('answered 200 with a body that is not stats');
	});

	it('names the status in the message the log gets', async () => {
		stubFetch({
			ok: false,
			status: 403,
			statusText: 'Forbidden',
			json: async () => ({}),
		});

		const [err] = await $getPiholeV5Stats(input);

		expect(err?.message).toContain('Pi-hole responded with 403 Forbidden');
	});

	it('reports a network failure as an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('ECONNREFUSED');
			}),
		);

		const [err] = await $getPiholeV5Stats(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
