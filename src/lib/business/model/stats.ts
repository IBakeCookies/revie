/**
 * Statistics as the dashboard wants them, from whichever service was configured.
 *
 * A repository returns its vendor's own wire shape — snake_case, seconds, a list of
 * single-key objects for AdGuard. Projecting that onto the readings a box renders is
 * this layer's job, and it is why the route never talks to a repository: a caller should
 * not have to know that `avg_processing_time` is in seconds.
 *
 * The registry lives HERE and not in `data/`, which is where roadmap #33 put it, for one
 * reason that decides it: `Stat` is a presentation-facing vocabulary — its keys index a
 * message map — and `data` may not import a business type. A registry down there would
 * either move the projection out of business or hand `data` a type it cannot name.
 * Compile-time completeness is identical either way: `Record<ProviderName, ReadProvider>`.
 */

import type { ProviderName } from '$lib/business/model/config';
import type { Result } from '$lib/utils/useAsyncErrorAsValue';
import type { Stat } from '$lib/business/type/stats';
import { $getAdguardStats, type AdguardWire } from '$lib/data/repository/adguard';
import { $getPiholeV5Stats, type PiholeV5Wire } from '$lib/data/repository/pihole-v5';
import { $getPiholeV6Stats, type PiholeV6Wire } from '$lib/data/repository/pihole-v6';
import { $getUptimeKumaStats, type UptimeKumaWire } from '$lib/data/repository/uptime-kuma';
import { $getProxmoxStats, type ProxmoxWire } from '$lib/data/repository/proxmox';
import { $getOpenMeteoStats, type OpenMeteoWire } from '$lib/data/repository/open-meteo';
import { $getJellyfinStats, type JellyfinWire } from '$lib/data/repository/jellyfin';

/**
 * The page load awaits every read, so without a bound of our own an unreachable host
 * stalls the whole render on undici's defaults: 10s to fail a connection to a box that
 * is switched off, and 300s if something answers the SYN and then goes quiet (a
 * repurposed IP, a firewall that DROPs after the handshake). It is one box on the page;
 * it does not get to hold the other boxes hostage.
 *
 * Minted here rather than in each repository, and handed to the provider: the bound is a
 * page-latency policy, the same thing the TTL below is, and a provider that needs two
 * round trips would spend a per-fetch bound twice.
 */
const REQUEST_TIMEOUT_MS = 3000;
/**
 * Long enough that a dead instance costs at most two 3s timeouts a minute however much
 * traffic the page gets — the whole point, since that bound is otherwise paid on every
 * request — and short enough to be invisible against what these services report, which
 * is a rolling aggregate. The client refresh in `[...slug]/+page.svelte` must not tick
 * faster than this, or a refresh only re-reads what is already here.
 */
const STATS_TTL_MS = 30_000;
/**
 * Process state, on the same precedent as `config-source.ts`'s stamp cache: a store is
 * unreachable from the SSR path, and a `data/` module would be a second file for one
 * caller with no external name to own. Keyed per instance rather than as one blob, so
 * two pages naming different hosts do not evict each other and one dead instance does
 * not cost a live sibling its freshness.
 *
 * Deliberately not pruned. `admin-auth.ts` prunes because its keys are client addresses
 * and a stranger picks them; these come from `config.json`, so the set is bounded by a
 * file one operator writes.
 */
const cache = new Map<string, { readAt: number; result: Result<Stat[]> }>();

/** How a provider is called. The signal carries the whole read's budget. */
type ReadProvider = (input: {
	href: string;
	credential?: string;
	signal: AbortSignal;
}) => Promise<Result<Stat[]>>;

/**
 * Fetch, then project — in that order and nowhere else. The projection only ever runs on
 * the `[null, data]` branch, and its input type is inferred from the valibot schema the
 * repository already parsed, so it cannot read a field nothing validated. A 200 carrying
 * a shape nobody checked is `[AppError, null]` before a projection is reachable at all,
 * instead of a TypeError that 500s the whole page.
 */
async function read<W>(
	wire: Promise<Result<W>>,
	project: (data: W) => Stat[],
): Promise<Result<Stat[]>> {
	const [err, data] = await wire;

	return err ? [err, null] : [null, project(data)];
}

export function projectAdguard(data: AdguardWire): Stat[] {
	const [topBlockedDomain] = Object.keys(data.top_blocked_domains.at(0) ?? {});

	return [
		{
			key: 'dns-queries',
			value: data.num_dns_queries,
		},
		{
			key: 'blocked',
			value: data.num_blocked_filtering,
		},
		{
			// AdGuard reports seconds; `avg-latency` is milliseconds, because the key is
			// what carries the unit.
			key: 'avg-latency',
			value: Math.round(data.avg_processing_time * 1000),
		},
		{
			key: 'top-blocked-domain',
			value: topBlockedDomain ?? '–',
		},
	];
}

export function projectPiholeV5(data: PiholeV5Wire): Stat[] {
	return [
		{
			key: 'dns-queries',
			value: data.dns_queries_today,
		},
		{
			key: 'blocked',
			value: data.ads_blocked_today,
		},
		{
			// Pi-hole reports 0–100; `blocked-share` is a fraction, because the key carries
			// the unit and `Intl`'s percent style is what renders it.
			key: 'blocked-share',
			value: data.ads_percentage_today / 100,
		},
		{
			key: 'blocklist-domains',
			value: data.domains_being_blocked,
		},
	];
}

/** The same four readings as v5, off a wire that renamed and re-nested every one of them. */
export function projectPiholeV6(data: PiholeV6Wire): Stat[] {
	return [
		{
			key: 'dns-queries',
			value: data.queries.total,
		},
		{
			key: 'blocked',
			value: data.queries.blocked,
		},
		{
			key: 'blocked-share',
			value: data.queries.percent_blocked / 100,
		},
		{
			key: 'blocklist-domains',
			value: data.gravity.domains_being_blocked,
		},
	];
}

/** Uptime Kuma's heartbeat statuses. 2 is pending and 3 is maintenance; neither is down. */
const MONITOR_DOWN = 0;
const MONITOR_UP = 1;

export function projectUptimeKuma(data: UptimeKumaWire): Stat[] {
	// The beats arrive oldest-first, so the LAST one is the current state. Up and down are
	// counted separately rather than one being the other's remainder: a monitor that is
	// paused, in maintenance or has never reported is neither, and calling it down is a red
	// number for a service nobody said was broken.
	const current = Object.values(data.heartbeatList).map((beats) => beats.at(-1)?.status);
	const uptimes = Object.values(data.uptimeList);

	return [
		{
			key: 'monitors-up',
			value: current.filter((status) => status === MONITOR_UP).length,
		},
		{
			key: 'monitors-down',
			value: current.filter((status) => status === MONITOR_DOWN).length,
		},
		{
			// Kuma reports a 24h fraction per monitor and the box has room for one number, so
			// it is their mean. `|| 1` because a status page with no public monitors answers
			// `{}`, and 0/0 renders as "NaN%".
			key: 'uptime-24h',
			value: uptimes.reduce((total, uptime) => total + uptime, 0) / (uptimes.length || 1),
		},
	];
}

/**
 * The cluster's guests and load, off the one endpoint a standalone node answers too.
 * Guests are the `vm` entries — BOTH qemu VMs and LXC containers arrive as that type —
 * and running/stopped are counted separately rather than one being the other's remainder,
 * the same rule Uptime Kuma's monitors follow: a paused or otherwise odd guest is neither.
 * A template is excluded from both counts: on the wire it is a stopped guest, but it is
 * not something an operator stopped.
 */
export function projectProxmox(data: ProxmoxWire): Stat[] {
	const guests = data.data.filter((entry) => entry.type === 'vm' && entry.template === undefined);
	const nodes = data.data.filter((entry) => entry.type === 'node' && entry.status === 'online');

	return [
		{
			key: 'guests-running',
			value: guests.filter((guest) => guest.status === 'running').length,
		},
		{
			key: 'guests-stopped',
			value: guests.filter((guest) => guest.status === 'stopped').length,
		},
		{
			// The wire reports fractions already, so nothing to divide. The mean is
			// unweighted across online nodes — for the single-node setup this box mostly
			// serves there is one node and it is exact — with `|| 1` because a cluster
			// answering with no online node must render 0%, not "NaN%".
			key: 'cpu-share',
			value: nodes.reduce((total, node) => total + (node.cpu ?? 0), 0) / (nodes.length || 1),
		},
		{
			// Memory aggregates as a SUM rather than a mean: 32 GB half-used beside 8 GB
			// idle is 40 of 48 used, not 25%.
			key: 'memory-share',
			value:
				nodes.reduce((total, node) => total + (node.mem ?? 0), 0) /
				(nodes.reduce((total, node) => total + (node.maxmem ?? 0), 0) || 1),
		},
	];
}

/**
 * The current weather off the one provider that needs no secret and no handshake. The
 * dimensionals pass through UNTOUCHED — their unit is whatever the operator pinned into
 * the href (`temperature_unit=fahrenheit`, `wind_speed_unit=ms`), and converting here
 * would second-guess a query this layer never sees. Humidity is the exception because it
 * is not dimensional: a share on every wire, so it is normalized to the fraction its key
 * names, exactly like blocked-share above.
 */
export function projectOpenMeteo(data: OpenMeteoWire): Stat[] {
	return [
		{
			key: 'temperature',
			value: data.current.temperature_2m,
		},
		{
			key: 'apparent-temperature',
			value: data.current.apparent_temperature,
		},
		{
			key: 'humidity',
			value: data.current.relative_humidity_2m / 100,
		},
		{
			key: 'wind-speed',
			value: data.current.wind_speed_10m,
		},
		{
			key: 'precipitation',
			value: data.current.precipitation,
		},
	];
}

/**
 * The one reading `/Sessions` is good for: sessions are devices, and only the ones
 * carrying a `NowPlayingItem` are actually watching. A paused stream still holds its
 * session's item, so it counts — it is an active seat, not a closed one.
 */
export function projectJellyfin(data: JellyfinWire): Stat[] {
	return [
		{
			key: 'streams-active',
			value: data.filter((session) => session.NowPlayingItem).length,
		},
	];
}

/**
 * Every provider a config may name. A missing key is a compile error, which is the same
 * guarantee the container schema gives the renderer — adding a provider is a repository
 * file, a projection and one line here.
 */
const providers: Record<ProviderName, ReadProvider> = {
	adguard: (input) => read($getAdguardStats(input), projectAdguard),
	'pihole-v5': (input) => read($getPiholeV5Stats(input), projectPiholeV5),
	'pihole-v6': (input) => read($getPiholeV6Stats(input), projectPiholeV6),
	'uptime-kuma': (input) => read($getUptimeKumaStats(input), projectUptimeKuma),
	proxmox: (input) => read($getProxmoxStats(input), projectProxmox),
	'open-meteo': (input) => read($getOpenMeteoStats(input), projectOpenMeteo),
	jellyfin: (input) => read($getJellyfinStats(input), projectJellyfin),
};

export type ReadStatsInput = {
	/** `statsKey(provider, href)`: the cache key AND the key the page records under. */
	key: string;
	provider: ProviderName;
	href: string;
	/** Resolved by the route from the variable the config named — never read from env here. */
	credential?: string;
};

/**
 * A read plus whether it actually went to the network. `isFresh` is a log gate, not a
 * data field — the same seam `ConfigRead` uses, and for the same reason: the route
 * prints a failed read, and a cached failure re-printed on every request is exactly the
 * per-request spam #23 took out.
 */
export type StatsRead = {
	result: Result<Stat[]>;
	isFresh: boolean;
};

export async function readStats({
	key,
	provider,
	href,
	credential,
}: ReadStatsInput): Promise<StatsRead> {
	const now = Date.now();
	const cached = cache.get(key);

	if (cached && now - cached.readAt < STATS_TTL_MS) {
		return {
			result: cached.result,
			isFresh: false,
		};
	}

	// The FAILURE is cached too, which is the half that matters: a host that is switched
	// off is the one that pays the 3s bound, so caching only successes would leave the
	// defect untouched. Same reasoning as `config-source.ts` caching a read failure
	// against the stamp that produced it — here the window expiring is what retries.
	const result = await providers[provider]({
		href,
		credential,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	cache.set(key, {
		readAt: now,
		result,
	});

	return {
		result,
		isFresh: true,
	};
}
