import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getForgejoStats, $getGiteaStats } from '$lib/data/repository/forge';

const href = 'https://git.lan:3000';

const input = {
	href,
	signal: AbortSignal.timeout(50),
};

function stubFetch(response: Partial<Response>): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async () => response as Response);

	vi.stubGlobal('fetch', fetchMock);

	return fetchMock;
}

/** One page of threads — the count is NOT read off this array. */
function threads(count: number): unknown[] {
	return Array.from({
		length: count,
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('$getGiteaStats', () => {
	it('asks for unread notifications only — the default filter would add pinned ones', async () => {
		const fetchMock = stubFetch({
			ok: true,
			headers: new Headers({
				'X-Total-Count': '7',
			}),
			json: async () => threads(7),
		});

		await $getGiteaStats(input);

		expect(fetchMock.mock.calls[0][0]).toBe(`${href}/api/v1/notifications?status-types=unread`);
	});

	it('sends the token as `Authorization: token` when one is configured', async () => {
		const fetchMock = stubFetch({
			ok: true,
			headers: new Headers({
				'X-Total-Count': '7',
			}),
			json: async () => threads(7),
		});

		await $getGiteaStats({
			...input,
			credential: 'a-gitea-token',
		});

		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			Authorization: 'token a-gitea-token',
		});
	});

	it('sends no header without a credential rather than an empty one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			headers: new Headers({
				'X-Total-Count': '7',
			}),
			json: async () => threads(7),
		});

		await $getGiteaStats(input);

		expect(fetchMock.mock.calls[0][1].headers).toEqual({});
	});

	it('uses the signal it was given rather than minting one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			headers: new Headers({
				'X-Total-Count': '7',
			}),
			json: async () => threads(7),
		});

		await $getGiteaStats(input);

		expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
	});

	// The reason the count rides the header and not the array: pagination. A 200-page
	// list of 200 unread arrives as 20 threads; counting them reports a wrong-but-
	// plausible number, which is worse than an error.
	it('answers with the total from X-Total-Count, not with the page length', async () => {
		stubFetch({
			ok: true,
			headers: new Headers({
				'X-Total-Count': '200',
			}),
			json: async () => threads(20),
		});

		const [err, res] = await $getGiteaStats(input);

		expect(err).toBeNull();

		expect(res).toEqual({
			total: 200,
		});
	});

	it('names the status in the message the log gets', async () => {
		stubFetch({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			headers: new Headers(),
			json: async () => ({}),
		});

		const [err] = await $getGiteaStats(input);

		expect(err?.message).toContain('Gitea responded with 401 Unauthorized');
	});

	it('reports a 200 without X-Total-Count as an error', async () => {
		stubFetch({
			ok: true,
			headers: new Headers(),
			json: async () => threads(20),
		});

		const [err, res] = await $getGiteaStats(input);

		expect(res).toBeNull();
		expect(err?.message).toContain('is not stats');
	});

	it('reports a 200 whose body is not a list as an error', async () => {
		stubFetch({
			ok: true,
			headers: new Headers({
				'X-Total-Count': '7',
			}),
			json: async () => ({
				message: 'token is required',
			}),
		});

		const [err, res] = await $getGiteaStats(input);

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

		const [err] = await $getGiteaStats(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});

describe('$getForgejoStats', () => {
	it('answers identically under its own name — Forgejo is the same wire', async () => {
		stubFetch({
			ok: true,
			headers: new Headers({
				'x-total-count': '3',
			}),
			json: async () => threads(3),
		});

		const [err, res] = await $getForgejoStats(input);

		expect(err).toBeNull();

		expect(res).toEqual({
			total: 3,
		});
	});

	it('names itself in the message the log gets', async () => {
		stubFetch({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			headers: new Headers(),
			json: async () => ({}),
		});

		const [err] = await $getForgejoStats(input);

		expect(err?.message).toContain('Forgejo responded with 401 Unauthorized');
	});
});
