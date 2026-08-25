import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getPaperlessStats } from '$lib/data/repository/paperless';

const href = 'https://paperless.lan:8000';

const input = {
	href,
	signal: AbortSignal.timeout(50),
};

/** A live answer, verbatim from a real instance's shape — including what the schema must drop. */
const statistics = {
	documents_total: 2349,
	documents_inbox: 18,
	inbox_tag: 5,
	document_file_type_counts: [
		{
			mime_type: 'application/pdf',
			mime_type_count: 2347,
		},
		{
			mime_type: 'image/jpeg',
			mime_type_count: 2,
		},
	],
	character_count: 30_462_624,
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

describe('$getPaperlessStats', () => {
	it('asks for /api/statistics/ with the trailing slash Django redirects the bare form for', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => statistics,
		});

		await $getPaperlessStats(input);

		expect(fetchMock.mock.calls[0][0]).toBe(`${href}/api/statistics/`);
	});

	it('sends the token as `Authorization: Token` when one is configured', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => statistics,
		});

		await $getPaperlessStats({
			...input,
			credential: 'a-paperless-token',
		});

		expect(fetchMock.mock.calls[0][1].headers).toEqual({
			Authorization: 'Token a-paperless-token',
		});
	});

	it('sends no header without a credential rather than an empty one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => statistics,
		});

		await $getPaperlessStats(input);

		expect(fetchMock.mock.calls[0][1].headers).toEqual({});
	});

	it('uses the signal it was given rather than minting one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => statistics,
		});

		await $getPaperlessStats(input);

		expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
	});

	it('answers with the two counts alone, dropping the mime breakdown and character count', async () => {
		stubFetch({
			ok: true,
			json: async () => statistics,
		});

		const [err, res] = await $getPaperlessStats(input);

		expect(err).toBeNull();

		expect(res).toEqual({
			documents_total: 2349,
			documents_inbox: 18,
		});
	});

	it('names the status in the message the log gets', async () => {
		stubFetch({
			ok: false,
			status: 401,
			statusText: 'Unauthorized',
			json: async () => ({}),
		});

		const [err] = await $getPaperlessStats(input);

		expect(err?.message).toContain('Paperless-ngx responded with 401 Unauthorized');
	});

	it('reports a 200 whose body has no counts as an error', async () => {
		stubFetch({
			ok: true,
			json: async () => ({
				detail: 'Invalid token.',
			}),
		});

		const [err, res] = await $getPaperlessStats(input);

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

		const [err] = await $getPaperlessStats(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
