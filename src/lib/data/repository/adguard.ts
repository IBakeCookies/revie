import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

interface GetAdguardStatsInput {
	username: string;
	password: string;
	href: string;
}

export interface GetAdguardStatsOutput {
	num_dns_queries: number;
	num_blocked_filtering: number;
	avg_processing_time: number;
	top_blocked_domains: Record<string, number>[];
}

/**
 * The page load awaits this, so without a bound of our own an unreachable AdGuard
 * host stalls the whole render on undici's defaults: 10s to fail a connection to a
 * box that is switched off, and 300s if something answers the SYN and then goes
 * quiet (a repurposed IP, a firewall that DROPs after the handshake). It is one
 * box on the page; it does not get to hold the other boxes hostage.
 */
const REQUEST_TIMEOUT_MS = 3000;

export async function getAdguardStats({
	username,
	password,
	href
}: GetAdguardStatsInput): Promise<Result<GetAdguardStatsOutput>> {
	const base64 = Buffer.from(`${username}:${password}`).toString('base64');

	return useAsyncErrorAsValue(async () => {
		const raw = await fetch(`${href}/control/stats`, {
			headers: {
				Authorization: `Basic ${base64}`,
				'Content-type': 'application/json'
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		});

		// fetch only rejects on network errors, so an auth failure would otherwise
		// surface as an unrelated JSON parse error.
		if (!raw.ok) {
			throw new Error(`AdGuard responded with ${raw.status} ${raw.statusText}`);
		}

		return raw.json();
	}, `Could not read AdGuard stats from ${href}`);
}
