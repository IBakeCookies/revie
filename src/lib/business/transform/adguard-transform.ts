import { type GetAdguardStatsOutput } from '$lib/data/repository/adguard';
import { type AdguardStats } from '$lib/business/type/adguard-stats';

export function transformAdguardStats(data: GetAdguardStatsOutput): AdguardStats {
	const [topBlockedDomain] = Object.keys(data.top_blocked_domains?.at(0) ?? {});

	return {
		dnsQueries: data.num_dns_queries,
		numBlockedFiltering: data.num_blocked_filtering,
		// AdGuard reports seconds, the box shows milliseconds
		avgProcessingTimeMs: Math.round(data.avg_processing_time * 1000),
		topBlockedDomain: topBlockedDomain ?? '–'
	};
}
