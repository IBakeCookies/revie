import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getProxmoxStats } from '$lib/data/repository/proxmox';

const input = {
	href: 'http://pve.local:8006',
	credential: 'root@pam!ci=abc123',
	// The read's budget is minted by business and handed down, so the repository's own
	// cases only need a signal that exists. Short enough that a leaked real fetch dies.
	signal: AbortSignal.timeout(50),
};

const resources = {
	data: [
		{
			type: 'node',
			status: 'online',
			cpu: 0.1,
			mem: 30_000_000_000,
			maxmem: 60_000_000_000,
		},
		{
			type: 'vm',
			status: 'running',
		},
	],
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

describe('$getProxmoxStats', () => {
	it('asks the cluster endpoint with the API token in the header the vendor reads', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => resources,
		});

		const [err, res] = await $getProxmoxStats(input);

		expect(err).toBeNull();
		expect(res).toEqual(resources);

		expect(fetchMock).toHaveBeenCalledWith(
			'http://pve.local:8006/api2/json/cluster/resources',
			expect.objectContaining({
				headers: {
					Authorization: 'PVEAPIToken=root@pam!ci=abc123',
				},
			}),
		);
	});

	// The docs show the whole header value, so that is what an operator following them
	// copies — and doubling it would be a silent 401 rather than a loud one.
	it('strips a pasted "PVEAPIToken=" prefix instead of doubling it', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => resources,
		});

		await $getProxmoxStats({
			...input,
			credential: 'PVEAPIToken=root@pam!ci=abc123',
		});

		expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('PVEAPIToken=root@pam!ci=abc123');
	});

	// The bound is the caller's, not this layer's — `stats.spec.ts` asserts the 3s value.
	// What this file has to keep true is that the signal handed in is the one used.
	it('uses the signal it was given rather than minting one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => resources,
		});

		await $getProxmoxStats(input);

		expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
	});

	// A 401 does not tell an operator they pasted only the secret UUID — the most likely
	// half-paste, and the one the `=` separates from a usable token.
	it('refuses a credential without the "tokenid=secret" half without asking Proxmox', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => resources,
		});

		const [err, res] = await $getProxmoxStats({
			...input,
			credential: 'root@pam!ci',
		});

		expect(res).toBeNull();
		expect(err?.message).toContain('credentials must be the API token');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	// The provider contract makes the credential optional, because a provider may need
	// none. Proxmox does, and says so as a failure rather than throwing a TypeError.
	it('reports a missing credential as a failure, not a crash', async () => {
		stubFetch({
			ok: true,
			json: async () => resources,
		});

		const [err] = await $getProxmoxStats({
			...input,
			credential: undefined,
		});

		expect(err?.message).toContain('credentials must be the API token');
	});

	it('names the status in the message the log gets', async () => {
		stubFetch({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			json: async () => ({}),
		});

		const [err] = await $getProxmoxStats(input);

		expect(err?.message).toContain('Proxmox responded with 401 Unauthorized');
	});

	it('reports an unauthorized response as an error instead of parsing it', async () => {
		stubFetch({
			ok: false,
			status: 403,
			statusText: 'Forbidden',
			json: async () => ({}),
		});

		const [err, res] = await $getProxmoxStats(input);

		expect(res).toBeNull();
		expect((err?.cause as Error).message).toBe('Proxmox responded with 403 Forbidden');
	});

	it('reports a 200 carrying something else as an error instead of letting it reach the projection', async () => {
		stubFetch({
			ok: true,
			json: async () => ({
				errors: 'permission denied - invalid pam credentials',
			}),
		});

		const [err, res] = await $getProxmoxStats(input);

		expect(res).toBeNull();
		expect(err?.message).toContain('answered 200 with a body that is not stats');
	});

	it('reports a network failure as an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('unable to verify the first certificate');
			}),
		);

		const [err] = await $getProxmoxStats(input);

		expect((err?.cause as Error).message).toBe('unable to verify the first certificate');
	});
});
