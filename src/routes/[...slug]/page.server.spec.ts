import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '$env/dynamic/private';
import { readAdguardStats } from '$lib/business/model/adguard';
import { readConfig } from '$lib/business/model/config-source';
import { load } from './+page.server';

vi.mock('$env/dynamic/private', () => ({
	env: {},
}));

vi.mock('$lib/business/model/config-source', () => ({
	readConfig: vi.fn(),
}));

vi.mock('$lib/business/model/adguard', () => ({
	readAdguardStats: vi.fn(),
}));

const boxAdguard = {
	name: 'BoxAdguard' as const,
	props: {
		href: 'http://adguard.local',
	},
};

const boxDate = {
	name: 'BoxDate' as const,
	props: {},
};

// The domain shape, not AdGuard's wire shape: business hands the route the four
// numbers a box renders. Turning the wire shape into this is tested next to it, in
// business/model/adguard.spec.ts.
const stats = {
	dnsQueries: 1234,
	numBlockedFiltering: 56,
	avgProcessingTimeMs: 12,
	topBlockedDomain: 'ads.example.com',
};

function configWith(...containers: (typeof boxAdguard | typeof boxDate)[]) {
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
	} as Parameters<typeof load>[0];
}

beforeEach(() => {
	env.ADGUARD_USERNAME = 'admin';
	env.ADGUARD_PASSWORD = 'secret';
	vi.mocked(readAdguardStats).mockResolvedValue([null, stats]);
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

	it('loads AdGuard stats for the configured instance', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxAdguard));

		expect(await load(event('/'))).toMatchObject({
			adguard: stats,
		});

		expect(readAdguardStats).toHaveBeenCalledWith({
			username: 'admin',
			password: 'secret',
			href: 'http://adguard.local',
		});

		expect(readAdguardStats).toHaveBeenCalledWith({
			username: 'admin',
			password: 'secret',
			href: 'http://adguard.local',
		});
	});

	it('skips AdGuard when the page has no such box', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxDate));

		expect(await load(event('/'))).toMatchObject({
			adguard: null,
		});

		expect(readAdguardStats).not.toHaveBeenCalled();
	});

	it('skips AdGuard when the credentials are not set', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(readConfig).mockResolvedValue(configWith(boxAdguard));
		env.ADGUARD_PASSWORD = '';

		expect(await load(event('/'))).toMatchObject({
			adguard: null,
		});

		expect(readAdguardStats).not.toHaveBeenCalled();
	});

	it('renders the page without stats when AdGuard is unreachable, and hands on why', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(readConfig).mockResolvedValue(configWith(boxAdguard));

		vi.mocked(readAdguardStats).mockResolvedValue([
			{
				message: 'Could not read AdGuard stats',
				cause: new Error('down'),
			},
			null,
		]);

		// A flag, never the message: `AppError.message` is English minted in `data`, and
		// the route is what turns this into a line in the user's language.
		expect(await load(event('/'))).toMatchObject({
			adguard: null,
			adguardFailed: true,
		});
	});

	it('reports no failure when there is nothing to read rather than a failure', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(readConfig).mockResolvedValue(configWith(boxAdguard));
		env.ADGUARD_PASSWORD = '';

		// An unconfigured box is an absence. Toasting it would put an operator's own
		// setup decision in front of every visitor on every page load.
		expect(await load(event('/'))).toMatchObject({
			adguardFailed: false,
		});
	});
});
