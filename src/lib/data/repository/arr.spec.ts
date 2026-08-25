import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getProwlarrStats, $getRadarrStats, $getSonarrStats } from '$lib/data/repository/arr';

const href = 'https://sonarr.lan:8989';

const input = {
	href,
	// The read's budget is minted by business and handed down, so these cases only need a
	// signal that exists. Short enough that a leaked real fetch dies.
	signal: AbortSignal.timeout(50),
};

/** A live answer's envelope — the records themselves are dozens of fields nobody reads. */
const queue = {
	page: 1,
	pageSize: 10,
	sortKey: 'timeleft',
	sortDirection: 'descending',
	totalRecords: 6,
	records: [],
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

describe('$getSonarrStats', () => {
	it('asks Sonarr for /api/v3/queue', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => queue,
		});

		await $getSonarrStats(input);

		expect(fetchMock.mock.calls[0][0]).toBe(`${href}/api/v3/queue`);
	});

	it('sends no header without a credential rather than an empty one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => queue,
		});

		await $getSonarrStats(input);

		expect(fetchMock.mock.calls[0][1].headers).toEqual({});
	});
});

describe('$getRadarrStats', () => {
	it('asks Radarr for /api/v3/queue too — the same envelope, its own host', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => queue,
		});

		await $getRadarrStats(input);

		expect(fetchMock.mock.calls[0][0]).toBe(`${href}/api/v3/queue`);
	});
});

// Prowlarr is NOT on v3 like the other two — its API version is v1, which is the one
// fact the roadmap's endpoint list had wrong and the reason the path is owned per
// product instead of shared.
describe('$getProwlarrStats', () => {
	it('asks Prowlarr for /api/v1/queue', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => queue,
		});

		await $getProwlarrStats(input);

		expect(fetchMock.mock.calls[0][0]).toBe(`${href}/api/v1/queue`);
	});
});

describe('the three readers', () => {
	it.each([
		['Sonarr', $getSonarrStats],
		['Radarr', $getRadarrStats],
		['Prowlarr', $getProwlarrStats],
	])('%s sends the key as X-Api-Key when one is configured', async (_, get) => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => queue,
		});

		await get({
			...input,
			credential: '0123456789abcdef0123456789abcdef',
		});

		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			'X-Api-Key': '0123456789abcdef0123456789abcdef',
		});
	});

	it.each([[$getSonarrStats], [$getRadarrStats], [$getProwlarrStats]])(
		'uses the signal it was given rather than minting one',
		async (get) => {
			const fetchMock = stubFetch({
				ok: true,
				json: async () => queue,
			});

			await get(input);

			expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
		},
	);

	it.each([
		['Sonarr', $getSonarrStats],
		['Radarr', $getRadarrStats],
		['Prowlarr', $getProwlarrStats],
	])('%s names itself and the status in the message the log gets', async (product, get) => {
		stubFetch({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			json: async () => ({}),
		});

		const [err] = await get(input);

		expect(err?.message).toContain(`${product} responded with 401 Unauthorized`);
	});

	it.each([[$getSonarrStats], [$getRadarrStats], [$getProwlarrStats]])(
		'reports a 200 whose body has no totalRecords as an error',
		async (get) => {
			stubFetch({
				ok: true,
				json: async () => ({
					message: 'Unauthorized',
				}),
			});

			const [err, res] = await get(input);

			expect(res).toBeNull();
			expect(err?.message).toContain('is not stats');
		},
	);

	it.each([[$getSonarrStats], [$getRadarrStats], [$getProwlarrStats]])(
		'reports a network failure as an error',
		async (get) => {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => {
					throw new Error('ECONNREFUSED');
				}),
			);

			const [err] = await get(input);

			expect((err?.cause as Error).message).toBe('ECONNREFUSED');
		},
	);

	it('answers with the count alone, dropping every record field', async () => {
		stubFetch({
			ok: true,
			json: async () => queue,
		});

		const [err, res] = await $getSonarrStats(input);

		expect(err).toBeNull();

		expect(res).toEqual({
			totalRecords: 6,
		});
	});
});
