import type { ConfigContainer } from '$lib/business/model/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '$lib/business/model/config-source';
import { readStatsFor } from '$lib/business/model/stats';
import { readFeedsFor } from '$lib/business/model/feed';
import { statsKey } from '$lib/business/model/config';
import { POST } from './+server';

vi.mock('$lib/business/model/config-source', () => ({
	readConfig: vi.fn(),
}));

// Both folds mocked whole: what this file pins is the GUARD — which requested names
// reach the reads and which are skipped — not the reads themselves.
vi.mock('$lib/business/model/stats', () => ({
	readStatsFor: vi.fn(),
}));

vi.mock('$lib/business/model/feed', () => ({
	readFeedsFor: vi.fn(),
}));

const HREF = 'http://adguard.local';
const OTHER_PAGE_HREF = 'http://adguard.other-page.local';
const FEED_HREF = 'https://example.local/feed.xml';

/** Nested in a Grid, to prove the allowlist sees boxes at any depth. */
function configWith(...containers: ConfigContainer[]) {
	return {
		config: {
			pages: {
				'/': {
					name: 'Home',
					containers,
				},
				'/other': {
					name: 'Other',
					containers: [
						{
							name: 'BoxFeed' as const,
							props: {
								href: FEED_HREF,
							},
						},
					],
				},
			},
		},
		warnings: [],
		error: null,
		mtimeMs: 1,
		isFresh: false,
	};
}

function post(body: unknown): Parameters<typeof POST>[0] {
	return {
		request: new Request('http://localhost/api/stats', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: typeof body === 'string' ? body : JSON.stringify(body),
		}),
	} as Parameters<typeof POST>[0];
}

beforeEach(() => {
	vi.mocked(readStatsFor).mockResolvedValue({
		stats: {},
		failed: [],
		errors: [],
		warnings: [],
	});

	vi.mocked(readFeedsFor).mockResolvedValue({
		feeds: {},
		failed: [],
		errors: [],
	});
});

describe('POST /api/stats', () => {
	it.each(['{nope', '[]', '"x"'])(
		'answers 400 when the body is not a JSON object (%s)',
		async (body) => {
			await expect(POST(post(body))).rejects.toMatchObject({
				status: 400,
			});

			expect(readStatsFor).not.toHaveBeenCalled();
		},
	);

	it('answers 503, not an empty allowlist, when the config could not be read', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		vi.mocked(readConfig).mockResolvedValue({
			config: {
				pages: {},
			},
			warnings: [],
			error: {
				message: 'Could not read the dashboard config at "config.json"',
				cause: null,
			},
			mtimeMs: 1,
			isFresh: true,
		});

		await expect(
			POST(
				post({
					stats: [],
					feeds: [],
				}),
			),
		).rejects.toMatchObject({
			status: 503,
		});
	});

	it('reads only the requested instances that are configured, at any nesting depth', async () => {
		vi.mocked(readConfig).mockResolvedValue(
			configWith({
				name: 'Grid',
				props: {
					items: [
						{
							name: 'BoxStats',
							props: {
								provider: 'adguard',
								href: HREF,
								secret: 'ADGUARD_MAIN',
							},
						},
					],
				},
			}),
		);

		await POST(
			post({
				stats: [statsKey('adguard', HREF), statsKey('adguard', 'http://not-configured.local')],
				feeds: [FEED_HREF, 'https://not-configured.local/rss.xml'],
			}),
		);

		expect(readStatsFor).toHaveBeenCalledWith(
			[
				{
					key: statsKey('adguard', HREF),
					provider: 'adguard',
					href: HREF,
					secret: 'ADGUARD_MAIN',
				},
			],
			expect.anything(),
		);

		expect(readFeedsFor).toHaveBeenCalledWith([FEED_HREF]);
	});

	it('builds the allowlist from every page, not just one', async () => {
		vi.mocked(readConfig).mockResolvedValue(
			configWith({
				name: 'BoxStats',
				props: {
					provider: 'adguard',
					href: OTHER_PAGE_HREF,
				},
			}),
		);

		await POST(
			post({
				stats: [statsKey('adguard', OTHER_PAGE_HREF)],
				feeds: [],
			}),
		);

		expect(readStatsFor).toHaveBeenCalledWith(
			[
				{
					key: statsKey('adguard', OTHER_PAGE_HREF),
					provider: 'adguard',
					href: OTHER_PAGE_HREF,
					secret: undefined,
				},
			],
			expect.anything(),
		);
	});

	// The quiet refusal: a stale key must not take the tick's other answers down with
	// it, so unconfigured names are skipped rather than answered with a 4xx.
	it('tolerates junk entries in the requested names', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith());

		await POST(
			post({
				stats: [42, null, statsKey('adguard', HREF)],
				feeds: ['not-even-a-url'],
			}),
		);

		expect(readStatsFor).toHaveBeenCalledWith([], expect.anything());
		expect(readFeedsFor).toHaveBeenCalledWith([]);
	});

	it('answers with the folds’ readings and failures verbatim', async () => {
		const printed = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const failed = [
			{
				key: statsKey('adguard', HREF),
				provider: 'adguard' as const,
				href: HREF,
			},
		];

		vi.mocked(readConfig).mockResolvedValue(configWith());

		vi.mocked(readStatsFor).mockResolvedValue({
			stats: {},
			failed,
			errors: ['AdGuard answered 401'],
			warnings: ['DASHBOARD_SECRET_ADGUARD_MAIN is not set'],
		});

		vi.mocked(readFeedsFor).mockResolvedValue({
			feeds: {},
			failed: [FEED_HREF],
			errors: [`Could not read the feed from ${FEED_HREF}`],
		});

		const response = await POST(
			post({
				stats: [],
				feeds: [],
			}),
		);

		const payload = await response.json();

		expect(payload).toEqual({
			stats: {},
			failedStats: failed,
			feeds: {},
			failedFeeds: [FEED_HREF],
		});

		// The operator channel: after first paint these are the reads going to the
		// network, so their failures print here or they print nowhere.
		expect(printed).toHaveBeenCalledWith('AdGuard answered 401');
		expect(warned).toHaveBeenCalledWith('DASHBOARD_SECRET_ADGUARD_MAIN is not set');
	});
});
