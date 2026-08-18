import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getAdguardStats } from '$lib/data/repository/adguard';

const input = {
	href: 'http://adguard.local',
	credential: 'admin:secret',
	// The read's budget is minted by business and handed down, so the repository's own
	// cases only need a signal that exists. Short enough that a leaked real fetch dies.
	signal: AbortSignal.timeout(50),
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
	it('asks the stats endpoint with basic auth built from the one credential', async () => {
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

	// The bound is the caller's, not this layer's — `stats.spec.ts` asserts the 3s value.
	// What this file has to keep true is that the signal handed in is the one used.
	it('uses the signal it was given rather than minting one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => stats,
		});

		await $getAdguardStats(input);

		expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
	});

	// A 401 does not tell an operator that they pasted only half of it, so a credential
	// with no colon fails here instead — before a request goes out at all.
	it('refuses a credential that is not "username:password" without asking AdGuard', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => stats,
		});

		const [err, res] = await $getAdguardStats({
			...input,
			credential: 'just-a-password',
		});

		expect(res).toBeNull();
		expect(err?.message).toContain('credentials must be "username:password"');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	// The provider contract makes the credential optional, because a provider may need
	// none. AdGuard does, and says so as a failure rather than throwing a TypeError.
	it('reports a missing credential as a failure, not a crash', async () => {
		stubFetch({
			ok: true,
			json: async () => stats,
		});

		const [err] = await $getAdguardStats({
			...input,
			credential: undefined,
		});

		expect(err?.message).toContain('credentials must be "username:password"');
	});

	// Everything after the FIRST colon is the password, so a password may contain colons.
	it('keeps a password that contains colons intact', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => stats,
		});

		await $getAdguardStats({
			...input,
			credential: 'admin:a:b:c',
		});

		expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
			`Basic ${Buffer.from('admin:a:b:c').toString('base64')}`,
		);
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

	// The projection runs outside the error-as-value boundary, and the load reads every
	// configured instance under one `Promise.all` — so `{}` here is not one empty box,
	// it is a TypeError out of `.at(0)` that 500s the page and loses the instances that
	// DID answer. Caught as a bad body instead, one instance fails alone.
	it('reports a 200 whose top_blocked_domains is not a list as an error', async () => {
		stubFetch({
			ok: true,
			json: async () => ({
				...stats,
				top_blocked_domains: {},
			}),
		});

		const [err, res] = await $getAdguardStats(input);

		expect(res).toBeNull();
		expect(err?.message).toContain('is not stats');
	});

	// AdGuard omits the field on a fresh install, and the schema defaults it — so the
	// projection's `.at(0)` has nothing to optional-chain.
	it('defaults a missing top_blocked_domains to an empty list', async () => {
		stubFetch({
			ok: true,
			json: async () => ({
				num_dns_queries: 1,
				num_blocked_filtering: 0,
				avg_processing_time: 0,
			}),
		});

		const [err, res] = await $getAdguardStats(input);

		expect(err).toBeNull();
		expect(res?.top_blocked_domains).toEqual([]);
	});

	// The same fresh install one wire value apart: Go's `encoding/json` writes a nil slice
	// as `null`. `v.optional` defaults `undefined` only, so this body — a 200 from an
	// instance that is answering correctly — used to fail the whole read.
	it('defaults a null top_blocked_domains to an empty list', async () => {
		stubFetch({
			ok: true,
			json: async () => ({
				...stats,
				top_blocked_domains: null,
			}),
		});

		const [err, res] = await $getAdguardStats(input);

		expect(err).toBeNull();
		expect(res?.top_blocked_domains).toEqual([]);
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
