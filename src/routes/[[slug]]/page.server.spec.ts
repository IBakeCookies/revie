import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '$env/dynamic/private';
import { getAdguardStats } from '$lib/data/repository/adguard';
import { readConfig } from '$lib/server/config';
import { load } from './+page.server';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/config', () => ({ readConfig: vi.fn() }));
vi.mock('$lib/data/repository/adguard', () => ({ getAdguardStats: vi.fn() }));

const boxAdguard = {
	name: 'BoxAdguard' as const,
	props: { href: 'http://adguard.local' }
};

const boxDate = { name: 'BoxDate' as const, props: {} };

const stats = {
	num_dns_queries: 1234,
	num_blocked_filtering: 56,
	avg_processing_time: 0.0123,
	top_blocked_domains: [{ 'ads.example.com': 42 }]
};

function configWith(...containers: (typeof boxAdguard | typeof boxDate)[]) {
	return { pages: { '/': { name: 'Home', containers } } };
}

/** The load function only ever touches the URL. */
function event(pathname: string): Parameters<typeof load>[0] {
	return { url: new URL(`http://localhost${pathname}`) } as Parameters<typeof load>[0];
}

beforeEach(() => {
	env.ADGUARD_USERNAME = 'admin';
	env.ADGUARD_PASSWORD = 'secret';
	vi.mocked(getAdguardStats).mockResolvedValue([null, stats]);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('load', () => {
	it('returns the containers of the configured page', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxDate));

		expect(await load(event('/'))).toMatchObject({ containers: [boxDate] });
	});

	it('fails with 404 when no page is configured for the path', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxDate));

		await expect(load(event('/nope'))).rejects.toMatchObject({ status: 404 });
	});

	it('loads AdGuard stats for the configured instance and transforms them', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxAdguard));

		expect(await load(event('/'))).toMatchObject({
			adguard: {
				dnsQueries: 1234,
				numBlockedFiltering: 56,
				avgProcessingTimeMs: 12,
				topBlockedDomain: 'ads.example.com'
			}
		});
		expect(getAdguardStats).toHaveBeenCalledWith({
			username: 'admin',
			password: 'secret',
			href: 'http://adguard.local'
		});
	});

	it('skips AdGuard when the page has no such box', async () => {
		vi.mocked(readConfig).mockResolvedValue(configWith(boxDate));

		expect(await load(event('/'))).toMatchObject({ adguard: null });
		expect(getAdguardStats).not.toHaveBeenCalled();
	});

	it('skips AdGuard when the credentials are not set', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(readConfig).mockResolvedValue(configWith(boxAdguard));
		env.ADGUARD_PASSWORD = '';

		expect(await load(event('/'))).toMatchObject({ adguard: null });
		expect(getAdguardStats).not.toHaveBeenCalled();
	});

	it('renders the page without stats when AdGuard is unreachable', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(readConfig).mockResolvedValue(configWith(boxAdguard));
		vi.mocked(getAdguardStats).mockResolvedValue([{ cause: new Error('down') }, null]);

		expect(await load(event('/'))).toMatchObject({ adguard: null });
	});
});
