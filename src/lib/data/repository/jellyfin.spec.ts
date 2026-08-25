import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getJellyfinStats } from '$lib/data/repository/jellyfin';

const href = 'https://jellyfin.lan';

const input = {
	href,
	credential: '0123456789abcdef0123456789abcdef',
	// The read's budget is minted by business and handed down, so these cases only need a
	// signal that exists. Short enough that a leaked real fetch dies.
	signal: AbortSignal.timeout(50),
};

/** A live answer's shape: one device playing, two idling — one without the key, one null. */
const sessions = [
	{
		Id: 'd4b1c2e3f4a5b6c7d8e9f0a1b2c3d4e5',
		UserId: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
		UserName: 'shadi',
		Client: 'Jellyfin Web',
		DeviceName: 'Living Room TV',
		PlayState: {
			IsPaused: false,
			MediaSourceId: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c',
			CanSeek: true,
		},
		NowPlayingItem: {
			Name: 'The Wire',
			Type: 'Series',
		},
	},
	{
		Id: '11223344556677889900aabbccddeeff',
		UserId: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
		UserName: 'shadi',
		Client: 'Jellyfin Web',
		DeviceName: 'Kitchen Laptop',
		PlayState: {
			IsPaused: false,
			CanSeek: true,
		},
	},
	{
		Id: 'fedcba9876543210fedcba9876543210',
		UserName: 'other',
		Client: 'Jellyfin for Android',
		PlayState: {
			IsPaused: true,
		},
		NowPlayingItem: null,
	},
];

function stubFetch(response: Partial<Response>): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async () => response as Response);

	vi.stubGlobal('fetch', fetchMock);

	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('$getJellyfinStats', () => {
	it('appends /Sessions to the base URL', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => sessions,
		});

		const [err] = await $getJellyfinStats(input);

		expect(err).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith('https://jellyfin.lan/Sessions', expect.anything());
	});

	it('sends the API key as X-Emby-Token', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => sessions,
		});

		await $getJellyfinStats(input);

		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			'X-Emby-Token': input.credential,
		});
	});

	// An instance read anonymously is not an empty-header request — sending `X-Emby-Token:
	// undefined` would be a different wire than sending none at all.
	it('sends no header when no credential was named', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => sessions,
		});

		await $getJellyfinStats({
			...input,
			credential: undefined,
		});

		expect(fetchMock.mock.calls[0][1].headers).toEqual({});
	});

	it('uses the signal it was given rather than minting one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => sessions,
		});

		await $getJellyfinStats(input);

		expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
	});

	// The API key rides a custom header, which a redirect strips neither — following one
	// would hand it to a host the operator never configured.
	it('refuses to follow redirects', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => sessions,
		});

		await $getJellyfinStats(input);

		expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
	});

	// Only NowPlayingItem's PRESENCE comes back per session: the schema names nothing
	// else, and valibot's output drops what nobody declared — so the projection cannot
	// read a field nothing validated.
	it('answers each session reduced to its playing marker alone', async () => {
		stubFetch({
			ok: true,
			json: async () => sessions,
		});

		const [err, res] = await $getJellyfinStats(input);

		expect(err).toBeNull();

		expect(res).toEqual([
			{
				NowPlayingItem: {},
			},
			{
				NowPlayingItem: null,
			},
			{
				NowPlayingItem: null,
			},
		]);
	});

	it('names the status in the message the log gets', async () => {
		stubFetch({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			json: async () => ({}),
		});

		const [err] = await $getJellyfinStats(input);

		expect(err?.message).toContain('Jellyfin responded with 401 Unauthorized');
	});

	// The projection runs outside the error-as-value boundary, so a body it cannot read has
	// to fail here — otherwise one malformed 200 is a TypeError that 500s the whole page.
	it('reports a 200 whose body is not a session list as an error', async () => {
		stubFetch({
			ok: true,
			json: async () => ({
				error: 'UnauthorizedException',
			}),
		});

		const [err, res] = await $getJellyfinStats(input);

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

		const [err] = await $getJellyfinStats(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
