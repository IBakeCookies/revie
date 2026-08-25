import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getImmichStats } from '$lib/data/repository/immich';

const href = 'https://immich.lan:2283';

const input = {
	href,
	signal: AbortSignal.timeout(50),
};

/** A live answer, verbatim shape — including what the schema must drop. */
const statistics = {
	photos: 89_494,
	videos: 1094,
	usage: 1_900_000_000_000,
	usagePhotos: 266_109_447_150,
	usageVideos: 225_718_340_831,
	usageByUser: [],
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

describe('$getImmichStats', () => {
	it('asks for /server/statistics off the base URL', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => statistics,
		});

		await $getImmichStats(input);

		expect(fetchMock.mock.calls[0][0]).toBe(`${href}/server/statistics`);
	});

	it('sends the key as x-api-key when one is configured', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => statistics,
		});

		await $getImmichStats({
			...input,
			credential: 'an-immich-key',
		});

		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			'x-api-key': 'an-immich-key',
		});
	});

	it('sends no header without a credential rather than an empty one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => statistics,
		});

		await $getImmichStats(input);

		expect(fetchMock.mock.calls[0][1].headers).toEqual({});
	});

	it('uses the signal it was given rather than minting one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => statistics,
		});

		await $getImmichStats(input);

		expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
	});

	it('answers with the two counts alone, dropping the byte counts and per-user breakdown', async () => {
		stubFetch({
			ok: true,
			json: async () => statistics,
		});

		const [err, res] = await $getImmichStats(input);

		expect(err).toBeNull();

		expect(res).toEqual({
			photos: 89_494,
			videos: 1094,
		});
	});

	it('names the status in the message the log gets', async () => {
		stubFetch({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			json: async () => ({}),
		});

		const [err] = await $getImmichStats(input);

		expect(err?.message).toContain('Immich responded with 401 Unauthorized');
	});

	it('reports a 200 whose body has no counts as an error', async () => {
		stubFetch({
			ok: true,
			json: async () => ({
				detail: 'The user does not have permission server.statistics (v1.137+)',
			}),
		});

		const [err, res] = await $getImmichStats(input);

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

		const [err] = await $getImmichStats(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
