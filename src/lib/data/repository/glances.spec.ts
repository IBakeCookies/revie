import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getGlancesStats } from '$lib/data/repository/glances';

const href = 'http://nas.lan:61208';

const input = {
	href,
	signal: AbortSignal.timeout(50),
};

/** Live answers, verbatim from the docs' example responses — including what the schemas must drop. */
const cpu = {
	total: 6.2,
	user: 3.3,
	system: 3.2,
	idle: 93.2,
	iowait: 0.2,
	cpucore: 16,
};

const mem = {
	percent: 53.3,
	total: 16_421_208_064,
	used: 8_751_940_408,
	available: 7_669_267_656,
	free: 1_524_011_008,
};

/**
 * Both fetches must be asserted — same signal, same headers, two paths — so this one
 * records every call it saw instead of leaving the test to index into vitest's mock.
 */
function stubFetch(byPath: Record<string, unknown>): {
	calls: { url: string; init: RequestInit }[];
} {
	const calls: { url: string; init: RequestInit }[] = [];

	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string | URL, init: RequestInit) => {
			calls.push({
				url: String(url),
				init,
			});

			return {
				ok: true,
				json: async () => byPath[new URL(String(url)).pathname],
			} as Response;
		}),
	);

	return {
		calls,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('$getGlancesStats', () => {
	it('reads both plugins off the base URL', async () => {
		const { calls } = stubFetch({
			'/api/4/cpu': cpu,
			'/api/4/mem': mem,
		});

		await $getGlancesStats(input);

		expect(calls.map(({ url }) => url)).toEqual([`${href}/api/4/cpu`, `${href}/api/4/mem`]);
	});

	it('spends the one signal it was given across both fetches', async () => {
		const { calls } = stubFetch({
			'/api/4/cpu': cpu,
			'/api/4/mem': mem,
		});

		await $getGlancesStats(input);

		for (const { init } of calls) {
			expect(init.signal).toBe(input.signal);
		}
	});

	it('sends Basic auth when the server was started with its auth mode on', async () => {
		const { calls } = stubFetch({
			'/api/4/cpu': cpu,
			'/api/4/mem': mem,
		});

		await $getGlancesStats({
			...input,
			credential: 'user:password',
		});

		for (const { init } of calls) {
			expect(init.headers).toEqual({
				Authorization: `Basic ${btoa('user:password')}`,
			});
		}
	});

	it('sends no header without a credential rather than an empty Basic', async () => {
		const { calls } = stubFetch({
			'/api/4/cpu': cpu,
			'/api/4/mem': mem,
		});

		await $getGlancesStats(input);

		for (const { init } of calls) {
			expect(init.headers).toEqual({});
		}
	});

	it('answers with both readings, dropping every field nobody reads', async () => {
		stubFetch({
			'/api/4/cpu': cpu,
			'/api/4/mem': mem,
		});

		const [err, res] = await $getGlancesStats(input);

		expect(err).toBeNull();

		expect(res).toEqual({
			cpu: {
				total: 6.2,
			},
			mem: {
				percent: 53.3,
			},
		});
	});

	it('names the failing plugin in the message the log gets', async () => {
		// A wrong path or an auth-mode server answering one plugin and not the other: cpu
		// answers, mem 401s.
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (new URL(url).pathname === '/api/4/mem') {
					return {
						ok: false,
						status: 401,
						statusText: 'Unauthorized',
					} as Response;
				}

				return {
					ok: true,
					json: async () => cpu,
				} as Response;
			}),
		);

		const [err] = await $getGlancesStats(input);

		expect(err?.message).toContain('Glances responded with 401 Unauthorized at /api/4/mem');
	});

	it('reports a 200 whose body has no readings as an error', async () => {
		stubFetch({
			'/api/4/cpu': {
				detail: 'Not Found',
			},
			'/api/4/mem': mem,
		});

		const [err, res] = await $getGlancesStats(input);

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

		const [err] = await $getGlancesStats(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
