import type { ConfigContainer } from '$lib/business/model/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '$env/dynamic/private';
import { readConfig } from '$lib/business/model/config-source';
import { readStats } from '$lib/business/model/stats';
import { statsKey } from '$lib/business/model/config';
import { load } from './+page.server';

vi.mock('$env/dynamic/private', () => ({
	env: {},
}));

vi.mock('$lib/business/model/config-source', () => ({
	readConfig: vi.fn(),
}));

vi.mock('$lib/business/model/stats', () => ({
	readStats: vi.fn(),
}));

const HREF = 'http://adguard.local';
const OTHER_HREF = 'http://adguard.other';

const boxStats = {
	name: 'BoxStats' as const,
	props: {
		provider: 'adguard' as const,
		href: HREF,
		secret: 'ADGUARD_MAIN',
	},
};

const secondBoxStats = {
	name: 'BoxStats' as const,
	props: {
		provider: 'adguard' as const,
		href: OTHER_HREF,
		secret: 'ADGUARD_OTHER',
	},
};

/** A provider that needs no credential, or an instance that has none: read anonymously. */
const boxStatsWithoutSecret = {
	name: 'BoxStats' as const,
	props: {
		provider: 'adguard' as const,
		href: HREF,
	},
};

const boxDate = {
	name: 'BoxDate' as const,
	props: {},
};

// The domain shape, not AdGuard's wire shape: business hands the route the readings a
// box renders. Turning the wire shape into this is tested next to it, in
// business/model/stats.spec.ts.
const stats = [
	{
		key: 'dns-queries' as const,
		value: 1234,
	},
];

const otherStats = [
	{
		key: 'dns-queries' as const,
		value: 99,
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

/** The load function only ever touches the URL and its own dependency handle. */
function event(pathname: string): Parameters<typeof load>[0] {
	return {
		depends: vi.fn(),
		url: new URL(`http://localhost${pathname}`),
	} as unknown as Parameters<typeof load>[0];
}

/**
 * `readStats` is mocked whole, so the TTL cache inside it never runs here — what this file
 * has to keep asserting is that a cached failure still crosses as a failure while only a
 * fresh one is printed.
 */
function fresh(result: Awaited<ReturnType<typeof readStats>>['result']) {
	return {
		result,
		isFresh: true,
	};
}

const down = {
	message: 'Could not read AdGuard stats',
	cause: new Error('down'),
};

beforeEach(() => {
	env.DASHBOARD_SECRET_ADGUARD_MAIN = 'admin:secret';
	env.DASHBOARD_SECRET_ADGUARD_OTHER = 'admin:other';
	vi.mocked(readStats).mockResolvedValue(fresh([null, stats]));
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
	 * The secret scheme, and the whole of its mangling rule: `DASHBOARD_SECRET_` plus the
	 * config's value VERBATIM. Folding case or punctuation would invent collisions whose
	 * failure mode is the wrong credential, silently.
	 */
	it('resolves the credential from the variable the config names, verbatim', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxStats));

		expect(await load(event('/'))).toMatchObject({
			stats: {
				[statsKey('adguard', HREF)]: stats,
			},
		});

		expect(readStats).toHaveBeenCalledWith({
			key: statsKey('adguard', HREF),
			provider: 'adguard',
			href: HREF,
			credential: 'admin:secret',
		});
	});

	it('does not fold the name, so a lowercase secret names a lowercase variable', async () => {
		env.DASHBOARD_SECRET_adguard_main = 'lower:case';

		vi.mocked(readConfig).mockResolvedValue(
			configWith({
				...boxStats,
				props: {
					...boxStats.props,
					secret: 'adguard_main',
				},
			}),
		);

		await load(event('/'));

		expect(readStats).toHaveBeenCalledWith(
			expect.objectContaining({
				credential: 'lower:case',
			}),
		);
	});

	/**
	 * What #17 fixed, now keyed by provider AND href. The load used to resolve the FIRST
	 * stats box on the page and hand that one reading to every box, so a second instance
	 * rendered the first one's numbers and its own host was never contacted.
	 */
	it('asks every configured instance and keys the readings by target', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxStats, secondBoxStats));

		vi.mocked(readStats).mockImplementation(async ({ href }) =>
			href === HREF ? fresh([null, stats]) : fresh([null, otherStats]),
		);

		expect(await load(event('/'))).toMatchObject({
			stats: {
				[statsKey('adguard', HREF)]: stats,
				[statsKey('adguard', OTHER_HREF)]: otherStats,
			},
		});

		expect(readStats).toHaveBeenCalledTimes(2);
	});

	// One box down does not blank the one that answered.
	it('keeps the instances that answered when another one did not', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(readConfig).mockResolvedValue(configWith(boxStats, secondBoxStats));

		vi.mocked(readStats).mockImplementation(async ({ href }) =>
			href === HREF ? fresh([null, stats]) : fresh([down, null]),
		);

		const data = await load(event('/'));

		expect(data).toMatchObject({
			stats: {
				[statsKey('adguard', HREF)]: stats,
			},
			failedStats: [
				{
					key: statsKey('adguard', OTHER_HREF),
					provider: 'adguard',
					href: OTHER_HREF,
				},
			],
		});

		// Spelled out because `toMatchObject` is a subset match: the instance that did not
		// answer has to be ABSENT, not present and empty, or its box renders blanks
		// instead of the line saying why.
		expect(data).not.toHaveProperty(['stats', statsKey('adguard', OTHER_HREF)]);
	});

	/**
	 * The reason the failure is a LIST and not a flag: one line is enough for one widget
	 * and useless for two. Each entry names the instance a user is looking at, so the route
	 * can raise one toast per empty box.
	 */
	it('reports every instance that failed, not just that one did', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(readConfig).mockResolvedValue(configWith(boxStats, secondBoxStats));
		vi.mocked(readStats).mockResolvedValue(fresh([down, null]));

		expect(await load(event('/'))).toMatchObject({
			failedStats: [
				{
					href: HREF,
				},
				{
					href: OTHER_HREF,
				},
			],
		});
	});

	it('skips the read when the page has no stats box', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxDate));

		expect(await load(event('/'))).toMatchObject({
			stats: {},
		});

		expect(readStats).not.toHaveBeenCalled();
	});

	/**
	 * An absence, not a failure: a variable the config names and the operator has not set is
	 * their own setup decision, and toasting it would put it in front of every visitor on
	 * every page load. The box is skipped and the log names the variable.
	 */
	it('skips a target whose secret variable is not set, without reporting it', async () => {
		const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});

		vi.mocked(readConfig).mockResolvedValue(configWith(boxStats));
		env.DASHBOARD_SECRET_ADGUARD_MAIN = '';

		expect(await load(event('/'))).toMatchObject({
			stats: {},
			failedStats: [],
		});

		expect(readStats).not.toHaveBeenCalled();
		expect(warned).toHaveBeenCalledWith(expect.stringContaining('DASHBOARD_SECRET_ADGUARD_MAIN'));
	});

	/**
	 * A box that names no variable is read anonymously — right for a provider that needs no
	 * credential. A provider that does answers 401, which is an ordinary failure.
	 */
	it('reads a target that names no secret at all', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxStatsWithoutSecret));

		await load(event('/'));

		expect(readStats).toHaveBeenCalledWith(
			expect.objectContaining({
				href: HREF,
				credential: undefined,
			}),
		);
	});

	it('renders the page without stats when the service is unreachable, and hands on why', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(readConfig).mockResolvedValue(configWith(boxStats));
		vi.mocked(readStats).mockResolvedValue(fresh([down, null]));

		const data = await load(event('/'));

		// Data, never the message: `AppError.message` is English minted in `data`, and the
		// route is what turns this into a line in the user's language.
		expect(data).toMatchObject({
			failedStats: [
				{
					provider: 'adguard',
					href: HREF,
				},
			],
		});

		expect(data).not.toHaveProperty(['stats', statsKey('adguard', HREF)]);
	});

	// The other half of the TTL cache. A failure it has already handed out still has to be
	// reported — the box is empty either way — while staying out of the log, or a
	// refreshing tab puts back the per-request spam #23 took out.
	it('reports a failure the cache had already printed, without printing it again', async () => {
		const printed = vi.spyOn(console, 'error').mockImplementation(() => {});

		vi.mocked(readConfig).mockResolvedValue(configWith(boxStats));

		vi.mocked(readStats).mockResolvedValue({
			result: [down, null],
			isFresh: false,
		});

		expect(await load(event('/'))).toMatchObject({
			failedStats: [
				{
					href: HREF,
				},
			],
		});

		expect(printed).not.toHaveBeenCalled();
	});
});
