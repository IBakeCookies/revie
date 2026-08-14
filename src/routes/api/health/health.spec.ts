import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyConfig } from '$lib/business/model/config';
import { readConfig } from '$lib/business/model/config-source';
import { GET } from './+server';

vi.mock('$lib/business/model/config-source', () => ({
	readConfig: vi.fn(),
}));

/** The handler touches nothing on the event. */
function health(): ReturnType<typeof GET> {
	return GET({} as Parameters<typeof GET>[0]);
}

beforeEach(() => {
	vi.mocked(readConfig).mockResolvedValue({
		config: {
			pages: {
				'/': {
					containers: [],
				},
				'/media/plex': {
					containers: [],
				},
			},
		},
		warnings: [],
		error: null,
		mtimeMs: 1700000000000,
		isFresh: true,
	});
});

describe('GET /api/health', () => {
	it('reports the page count and the config mtime', async () => {
		const response = await health();

		expect(response.status).toBe(200);

		await expect(response.json()).resolves.toEqual({
			pages: 2,
			mtimeMs: 1700000000000,
		});
	});

	it('answers 503 with the retained message when the config could not be read', async () => {
		vi.mocked(readConfig).mockResolvedValue({
			config: emptyConfig,
			warnings: [],
			error: {
				message: 'Could not reach the dashboard config at "config.json"',
				cause: new Error('ENOENT'),
			},
			mtimeMs: null,
			isFresh: true,
		});

		const response = await health();

		expect(response.status).toBe(503);

		await expect(response.json()).resolves.toEqual({
			error: 'Could not reach the dashboard config at "config.json"',
		});
	});
});
