/**
 * AdGuard statistics as the dashboard wants them.
 *
 * The repository returns AdGuard's own wire shape — snake_case, seconds, a list of
 * single-key objects. Projecting that onto the four numbers a box actually renders
 * is this layer's job, and it is why the route never talks to the repository: a
 * caller should not have to know that `avg_processing_time` is in seconds.
 */

import { getAdguardStats, type GetAdguardStatsOutput } from '$lib/data/repository/adguard';
import { type AdguardStats } from '$lib/business/type/adguard-stats';
import type { Result } from '$lib/utils/useAsyncErrorAsValue';

export interface ReadAdguardStatsInput {
	username: string;
	password: string;
	href: string;
}

export function transformAdguardStats(data: GetAdguardStatsOutput): AdguardStats {
	const [topBlockedDomain] = Object.keys(data.top_blocked_domains?.at(0) ?? {});

	return {
		dnsQueries: data.num_dns_queries,
		numBlockedFiltering: data.num_blocked_filtering,
		// AdGuard reports seconds, the box shows milliseconds
		avgProcessingTimeMs: Math.round(data.avg_processing_time * 1000),
		topBlockedDomain: topBlockedDomain ?? '–',
	};
}

export async function readAdguardStats(
	input: ReadAdguardStatsInput,
): Promise<Result<AdguardStats>> {
	const [err, raw] = await getAdguardStats(input);

	if (err) {
		return [err, null];
	}

	return [null, transformAdguardStats(raw)];
}
