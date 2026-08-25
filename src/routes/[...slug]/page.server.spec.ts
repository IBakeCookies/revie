import type { ConfigContainer } from '$lib/business/model/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '$env/dynamic/private';
import { readConfig } from '$lib/business/model/config-source';
import { readStatsFor } from '$lib/business/model/stats';
import { readFeedsFor } from '$lib/business/model/feed';
import { statsKey } from '$lib/business/model/config';
import { load } from './+page.server';

vi.mock('$env/dynamic/private', () => ({
	env: {},
}));

vi.mock('$lib/business/model/config-source', () => ({
	readConfig: vi.fn(),
}));

// Both folds are mocked whole: what this file has to keep asserting is that the load
// hands each of them the page's own targets and hands their answers on verbatim. How a
// fold plans reads, resolves credentials and gates its log lines is covered next to the
// folds themselves, in business/model/stats.spec.ts and feed.spec.ts.
vi.mock('$lib/business/model/stats', () => ({
	readStatsFor: vi.fn(),
}));

vi.mock('$lib/business/model/feed', () => ({
	readFeedsFor: vi.fn(),
}));

const HREF = 'http://adguard.local';

const boxStats = {
	name: 'BoxStats' as const,
	props: {
		provider: 'adguard' as const,
		href: HREF,
		secret: 'ADGUARD_MAIN',
	},
};

const boxDate = {
	name: 'BoxDate' as const,
	props: {},
};

const boxService = {
	name: 'BoxService' as const,
	props: {
		title: 'Proxmox',
		href: 'https://proxmox.local:8006',
		img: {
			src: 'https://icons.local/p.svg',
		},
	},
};

const FEED_HREF = 'https://example.local/feed.xml';

const boxFeed = {
	name: 'BoxFeed' as const,
	props: {
		href: FEED_HREF,
	},
};

/** The domain shape, not AdGuard's wire shape: the projection is tested in stats.spec.ts. */
const stats = [
	{
		key: 'dns-queries' as const,
		value: 1234,
	},
];

function configWith(...containers: ConfigContainer[]) {
	return {
		config: {
			pages: {
				'/': {
					name: 'Home',
					containers,
				},
			},
		},
		warnings: [],
		error: null,
		mtimeMs: 1,
		isFresh: false,
	};
}

/** The load function only ever touches the URL. */
function event(pathname: string): Parameters<typeof load>[0] {
	return {
		url: new URL(`http://localhost${pathname}`),
	} as unknown as Parameters<typeof load>[0];
}

beforeEach(() => {
	vi.mocked(readStatsFor).mockResolvedValue({
		stats: {
			[statsKey('adguard', HREF)]: stats,
		},
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

afterEach(() => {
	vi.restoreAllMocks();
});

describe('load', () => {
	it('returns the containers of the configured page', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxDate));

		expect(await load(event('/'))).toMatchObject({
			containers: [boxDate],
		});
	});

	/**
	 * The quick-jump filters over every configured page, not just the one being
	 * served — that is the whole of what it adds beside the nav rail. The name
	 * fallback is `pageEntries`' own; asserted here because this is where it crosses.
	 */
	it('lists every configured page as a jump target, named or falling back to its path', async () => {
		vi.mocked(readConfig).mockResolvedValue({
			config: {
				pages: {
					'/': {
						name: 'Home',
						containers: [],
					},
					'/unnamed': {
						containers: [],
					},
				},
			},
			warnings: [],
			error: null,
			mtimeMs: 1,
			isFresh: false,
		});

		expect(await load(event('/'))).toMatchObject({
			pages: [
				{
					path: '/',
					name: 'Home',
				},
				{
					path: '/unnamed',
					name: '/unnamed',
				},
			],
		});
	});

	/**
	 * The services half of the same list, and the reason it is collected HERE: the
	 * palette offers what is on screen, so another page's tile must stay off it even
	 * though the whole config was in hand. Dedupe is `collectServiceLinks`' own.
	 */
	it('collects only the requested page’s services as jump targets', async () => {
		vi.mocked(readConfig).mockResolvedValue({
			config: {
				pages: {
					'/': {
						name: 'Home',
						containers: [
							boxService,
							{
								name: 'Grid',
								props: {
									items: [
										{
											...boxService,
										},
									],
								},
							},
						],
					},
					'/other': {
						name: 'Other',
						containers: [boxService],
					},
				},
			},
			warnings: [],
			error: null,
			mtimeMs: 1,
			isFresh: false,
		});

		expect(await load(event('/'))).toMatchObject({
			services: [
				{
					title: 'Proxmox',
					href: 'https://proxmox.local:8006',
				},
			],
		});
	});

	it('fails with 404 when no page is configured for the path', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxDate));

		await expect(load(event('/nope'))).rejects.toMatchObject({
			status: 404,
		});
	});

	// A 404 blamed the URL for a config the server could not open — the one thing the
	// operator needed to be told, and the reason every page 404s at once.
	it('fails with 503, not 404, when the config itself could not be read', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		vi.mocked(readConfig).mockResolvedValue({
			config: {
				pages: {},
			},
			warnings: [],
			error: {
				message: 'Could not read the dashboard config at "config.json"',
				cause: new SyntaxError('Unexpected token'),
			},
			mtimeMs: 1,
			isFresh: true,
		});

		await expect(load(event('/'))).rejects.toMatchObject({
			status: 503,
		});
	});

	/**
	 * The whole read is planned by `readStatsFor` now — credential resolution included —
	 * so what this side owns is the TARGETS: every stats instance on THIS page, secret
	 * name carried, and the environment record to resolve them against.
	 */
	it('hands readStatsFor the page’s own targets and the environment', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxStats));

		await load(event('/'));

		expect(readStatsFor).toHaveBeenCalledWith(
			[
				{
					key: statsKey('adguard', HREF),
					provider: 'adguard',
					href: HREF,
					secret: 'ADGUARD_MAIN',
				},
			],
			env,
		);
	});

	it('hands readFeedsFor the page’s own feed hrefs', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxFeed));

		await load(event('/'));

		expect(readFeedsFor).toHaveBeenCalledWith([FEED_HREF]);
	});

	it('answers with the folds’ readings and failures verbatim', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const failed = [
			{
				key: statsKey('adguard', HREF),
				provider: 'adguard' as const,
				href: HREF,
			},
		];

		vi.mocked(readConfig).mockResolvedValue(configWith(boxStats, boxFeed));

		vi.mocked(readStatsFor).mockResolvedValue({
			stats: {},
			failed,
			errors: ['down'],
			warnings: [],
		});

		vi.mocked(readFeedsFor).mockResolvedValue({
			feeds: {
				[FEED_HREF]: [],
			},
			failed: [FEED_HREF],
			errors: [],
		});

		const data = await load(event('/'));

		expect(data).toMatchObject({
			stats: {},
			failedStats: failed,
			feeds: {
				[FEED_HREF]: [],
			},
			failedFeeds: [FEED_HREF],
		});
	});

	// The operator channel stays in the route: the folds return finished lines, and
	// this file is one of the console homes that prints them.
	it('prints the folds’ log lines, warnings among errors', async () => {
		const printed = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});

		vi.mocked(readConfig).mockResolvedValue(configWith(boxStats, boxFeed));

		vi.mocked(readStatsFor).mockResolvedValue({
			stats: {},
			failed: [],
			errors: ['AdGuard answered 401'],
			warnings: ['DASHBOARD_SECRET_ADGUARD_MAIN is not set'],
		});

		vi.mocked(readFeedsFor).mockResolvedValue({
			feeds: {},
			failed: [FEED_HREF],
			errors: [`Could not read the feed from ${FEED_HREF}`],
		});

		await load(event('/'));

		expect(printed).toHaveBeenCalledWith('AdGuard answered 401');
		expect(printed).toHaveBeenCalledWith(`Could not read the feed from ${FEED_HREF}`);
		expect(warned).toHaveBeenCalledWith('DASHBOARD_SECRET_ADGUARD_MAIN is not set');
	});

	it('asks for nothing when the page has neither stats nor feeds', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxDate));

		expect(await load(event('/'))).toMatchObject({
			stats: {},
			feeds: {},
		});

		expect(readStatsFor).toHaveBeenCalledWith([], env);
		expect(readFeedsFor).toHaveBeenCalledWith([]);
	});
});
