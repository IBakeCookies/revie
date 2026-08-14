import { $getAdguardStats, type GetAdguardStatsOutput } from '$lib/data/repository/adguard';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readAdguardStats, transformAdguardStats } from '$lib/business/model/adguard';

vi.mock('$lib/data/repository/adguard', () => ({
	$getAdguardStats: vi.fn(),
}));

const input = {
	username: 'admin',
	password: 'secret',
	href: 'http://adguard.local',
};

const raw: GetAdguardStatsOutput = {
	num_dns_queries: 1234,
	num_blocked_filtering: 56,
	avg_processing_time: 0.0123,
	top_blocked_domains: [
		{
			'ads.example.com': 42,
		},
		{
			'tracker.example.com': 7,
		},
	],
};

describe('transformAdguardStats', () => {
	it('maps the counters and converts seconds to whole milliseconds', () => {
		expect(transformAdguardStats(raw)).toEqual({
			dnsQueries: 1234,
			numBlockedFiltering: 56,
			avgProcessingTimeMs: 12,
			topBlockedDomain: 'ads.example.com',
		});
	});

	it('falls back to a dash when AdGuard reports no blocked domains', () => {
		expect(
			transformAdguardStats({
				...raw,
				top_blocked_domains: [],
			}).topBlockedDomain,
		).toBe('–');
	});

	it('survives a response without the top_blocked_domains field', () => {
		expect(
			transformAdguardStats({
				...raw,
				top_blocked_domains: undefined,
			}).topBlockedDomain,
		).toBe('–');
	});
});

describe('readAdguardStats', () => {
	beforeEach(() => {
		vi.mocked($getAdguardStats).mockReset();
	});

	it('hands the repository error back untouched', async () => {
		const failure = {
			message: 'answered 200 with a body that is not stats',
		};

		vi.mocked($getAdguardStats).mockResolvedValue([failure, null]);

		const [err, stats] = await readAdguardStats(input);

		expect(stats).toBeNull();
		expect(err).toBe(failure);
	});

	it('projects a successful read', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);

		const [err, stats] = await readAdguardStats(input);

		expect(err).toBeNull();

		expect(stats).toEqual({
			dnsQueries: 1234,
			numBlockedFiltering: 56,
			avgProcessingTimeMs: 12,
			topBlockedDomain: 'ads.example.com',
		});
	});
});
