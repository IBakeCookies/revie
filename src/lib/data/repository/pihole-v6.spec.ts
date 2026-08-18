import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getPiholeV6Stats } from '$lib/data/repository/pihole-v6';

const summary = {
	queries: {
		total: 1234,
		blocked: 56,
		percent_blocked: 4.5,
	},
	gravity: {
		domains_being_blocked: 104756,
	},
};

/**
 * The session cache is module-scope process state, so every case reads its own href — the
 * same trick `stats.spec.ts` and `admin-auth.spec.ts` use, and the reason this module needs
 * no test-only reset export.
 */
function input(href: string) {
	return {
		href,
		credential: 'hunter2',
		// The read's budget is minted by business and handed down, and it covers BOTH round
		// trips. Short enough that a leaked real fetch dies.
		signal: AbortSignal.timeout(50),
	};
}

/** Answers the login and the summary separately, so a case can make one of them fail. */
function stubFetch(auth: Partial<Response>, stats: Partial<Response>): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async (url: string) =>
		url.endsWith('/api/auth') ? (auth as Response) : (stats as Response),
	);

	vi.stubGlobal('fetch', fetchMock);

	return fetchMock;
}

const session = {
	ok: true,
	json: async () => ({
		session: {
			sid: 'sid-1',
			valid: true,
		},
	}),
};

const stats = {
	ok: true,
	status: 200,
	json: async () => summary,
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('$getPiholeV6Stats', () => {
	it('logs in, then reads the summary with the session id in the header', async () => {
		const fetchMock = stubFetch(session, stats);
		const [err, res] = await $getPiholeV6Stats(input('http://handshake.local'));

		expect(err).toBeNull();
		expect(res).toEqual(summary);

		expect(fetchMock.mock.calls[0][0]).toBe('http://handshake.local/api/auth');

		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
			password: 'hunter2',
		});

		expect(fetchMock.mock.calls[1][0]).toBe('http://handshake.local/api/stats/summary');
		expect(fetchMock.mock.calls[1][1].headers['X-FTL-SID']).toBe('sid-1');
	});

	/**
	 * The whole point of the bound being business's: two round trips under ONE signal, so a
	 * provider that needs a handshake does not quietly spend the page's budget twice.
	 */
	it('spends one signal across both round trips', async () => {
		const fetchMock = stubFetch(session, stats);
		const read = input('http://one-budget.local');

		await $getPiholeV6Stats(read);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[0][1].signal).toBe(read.signal);
		expect(fetchMock.mock.calls[1][1].signal).toBe(read.signal);
	});

	/**
	 * FTL caps `webserver.api.max_sessions` at 16 and answers 429 once they are gone, so a
	 * login per read would take the operator's own admin UI down. The cache is what stops it.
	 */
	it('reuses the session on a second read rather than logging in again', async () => {
		const fetchMock = stubFetch(session, stats);

		await $getPiholeV6Stats(input('http://reused.local'));
		await $getPiholeV6Stats(input('http://reused.local'));

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls[2][0]).toBe('http://reused.local/api/stats/summary');
	});

	// A session outlives the stats window but not FTL's 30-minute timeout, so an expired id
	// is the ordinary case: dropped, re-authed exactly once, and the read retried.
	it('re-authenticates once when the cached session has expired', async () => {
		const expired = {
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			json: async () => ({}),
		};

		stubFetch(session, stats);

		await $getPiholeV6Stats(input('http://expired.local'));

		const fetchMock = stubFetch(session, expired);
		const [err] = await $getPiholeV6Stats(input('http://expired.local'));

		// The stale read, the login, and the retry — which failed here only because the stub
		// answers 401 to every summary call.
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock.mock.calls[1][0]).toBe('http://expired.local/api/auth');
		expect(err?.message).toContain('Pi-hole responded with 401 Unauthorized');
	});

	/**
	 * A 401 that is NOT an expired session — a proxy stripping `X-FTL-SID`, TOTP, an app
	 * password without the scope — never stops, and re-authing on each one spent one of
	 * FTL's 16 seats per read: gone in eight minutes at the 30s stats window, with the
	 * operator locked out of their own admin UI by the 429 the cache exists to prevent.
	 */
	it('does not log in again for a session that was refused the moment it was minted', async () => {
		const refused = {
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			json: async () => ({}),
		};

		stubFetch(session, refused);

		await $getPiholeV6Stats(input('http://stripped.local'));

		const fetchMock = stubFetch(session, refused);
		const [err] = await $getPiholeV6Stats(input('http://stripped.local'));

		// The summary alone: the cached session is still the newest one FTL will issue.
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('http://stripped.local/api/stats/summary');
		expect(err?.message).toContain('Pi-hole responded with 401 Unauthorized');
	});

	/**
	 * v6 always authenticates where v5 has a branch, so a box naming no secret could never
	 * be read: `/api/auth` answers 200 with `sid: null` for an instance with no password
	 * set, which is the same body a refusal sends.
	 */
	it('reads the summary without logging in when no credential was given', async () => {
		const fetchMock = stubFetch(session, stats);

		const [err, res] = await $getPiholeV6Stats({
			...input('http://open.local'),
			credential: undefined,
		});

		expect(err).toBeNull();
		expect(res).toEqual(summary);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('http://open.local/api/stats/summary');
		expect(fetchMock.mock.calls[0][1].headers['X-FTL-SID']).toBeUndefined();
	});

	// The status is what tells an operator to look at their open sessions rather than at
	// their password.
	it('names the status when the login is refused', async () => {
		stubFetch(
			{
				ok: false,
				status: 429,
				statusText: 'Too Many Requests',
				json: async () => ({}),
			},
			stats,
		);

		const [err] = await $getPiholeV6Stats(input('http://no-seats.local'));

		expect(err?.message).toContain('Pi-hole refused the login with 429 Too Many Requests');
	});

	// `sid` is nullable on this wire, so a refusal can arrive as a 200. Caught here, it does
	// not become an `X-FTL-SID: null` header and a second, more confusing failure.
	it('reports a login that returned no session id as an error', async () => {
		stubFetch(
			{
				ok: true,
				json: async () => ({
					session: {
						sid: null,
						valid: false,
					},
				}),
			},
			stats,
		);

		const [err, res] = await $getPiholeV6Stats(input('http://no-sid.local'));

		expect(res).toBeNull();
		expect(err?.message).toContain('accepted the login without returning a session id');
	});

	// The projection runs outside the error-as-value boundary, so a body it cannot read has
	// to fail here — otherwise one malformed 200 is a TypeError that 500s the whole page.
	it('reports a 200 that is missing the gravity block as an error', async () => {
		stubFetch(session, {
			ok: true,
			status: 200,
			json: async () => ({
				queries: summary.queries,
			}),
		});

		const [err, res] = await $getPiholeV6Stats(input('http://no-gravity.local'));

		expect(res).toBeNull();
		expect(err?.message).toContain('answered 200 with a body that is not stats');
	});

	it('reports a network failure as an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('ECONNREFUSED');
			}),
		);

		const [err] = await $getPiholeV6Stats(input('http://unreachable.local'));

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
