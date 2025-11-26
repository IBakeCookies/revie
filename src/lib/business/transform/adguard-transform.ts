import { type GetAdguardStatsOutput } from '$lib/data/repository/adguard';
import { type AdguardStats } from '$lib/business/type/adguard-stats';

export function transformAdguardStats(data: GetAdguardStatsOutput): AdguardStats {
	return {
		dnsQueries: data.num_dns_queries,
		numBlockedFiltering: data.num_blocked_filtering,
		avgProcessingTime: data.avg_processing_time.toFixed(3),
		topBlockedDomain: Object.keys(data.top_blocked_domains.at(0) || {}).join('')
	};
}
