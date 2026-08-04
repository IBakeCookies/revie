import type { GetAdguardStatsOutput } from '$lib/data/repository/adguard';
import { describe, expect, it } from 'vitest';
import { transformAdguardStats } from '$lib/business/model/adguard';

const raw: GetAdguardStatsOutput = {
	num_dns_queries: 1234,
	num_blocked_filtering: 56,
	avg_processing_time: 0.0123,
	top_blocked_domains: [{ 'ads.example.com': 42 }, { 'tracker.example.com': 7 }],
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
		expect(transformAdguardStats({ ...raw, top_blocked_domains: [] }).topBlockedDomain).toBe(
			'–',
		);
	});

	it('survives a response without the top_blocked_domains field', () => {
		const withoutDomains = { ...raw, top_blocked_domains: undefined };

		expect(
			transformAdguardStats(withoutDomains as unknown as GetAdguardStatsOutput)
				.topBlockedDomain,
		).toBe('–');
	});
});
