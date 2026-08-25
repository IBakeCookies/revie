import type { AdguardWire } from '$lib/data/repository/adguard';
import type { PiholeV5Wire } from '$lib/data/repository/pihole-v5';
import type { PiholeV6Wire } from '$lib/data/repository/pihole-v6';
import type { UptimeKumaWire } from '$lib/data/repository/uptime-kuma';
import type { ProxmoxWire } from '$lib/data/repository/proxmox';
import type { OpenMeteoWire } from '$lib/data/repository/open-meteo';
import type { JellyfinWire } from '$lib/data/repository/jellyfin';
import { $getAdguardStats } from '$lib/data/repository/adguard';
import { $getPiholeV5Stats } from '$lib/data/repository/pihole-v5';
import { $getPiholeV6Stats } from '$lib/data/repository/pihole-v6';
import { $getUptimeKumaStats } from '$lib/data/repository/uptime-kuma';
import { $getProxmoxStats } from '$lib/data/repository/proxmox';
import { $getOpenMeteoStats } from '$lib/data/repository/open-meteo';
import { $getJellyfinStats } from '$lib/data/repository/jellyfin';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerNames } from '$lib/business/model/config';
import {
	projectAdguard,
	projectPiholeV5,
	projectPiholeV6,
	projectProxmox,
	projectUptimeKuma,
	projectOpenMeteo,
	projectJellyfin,
	readStats,
	readStatsFor,
} from '$lib/business/model/stats';
import { statsKey } from '$lib/business/model/config';

vi.mock('$lib/data/repository/adguard', () => ({
	$getAdguardStats: vi.fn(),
}));

// Every repository the registry names, so the completeness case below walks `providerNames`
// without one of them reaching a real network.
vi.mock('$lib/data/repository/pihole-v5', () => ({
	$getPiholeV5Stats: vi.fn(),
}));

vi.mock('$lib/data/repository/pihole-v6', () => ({
	$getPiholeV6Stats: vi.fn(),
}));

vi.mock('$lib/data/repository/uptime-kuma', () => ({
	$getUptimeKumaStats: vi.fn(),
}));

vi.mock('$lib/data/repository/proxmox', () => ({
	$getProxmoxStats: vi.fn(),
}));

vi.mock('$lib/data/repository/open-meteo', () => ({
	$getOpenMeteoStats: vi.fn(),
}));

vi.mock('$lib/data/repository/jellyfin', () => ({
	$getJellyfinStats: vi.fn(),
}));

/** Mirrors `STATS_TTL_MS`, which the module does not export — the same shape as `poll-services-state.spec.ts`. */
const STATS_TTL_MS = 30_000;

/**
 * The TTL cache is module-scope process state, so every case reads its own key — the same
 * trick `admin-auth.spec.ts` uses to give each of its cases an address of its own, and the
 * reason neither module needs a test-only reset export.
 */
function input(href: string) {
	return {
		key: `adguard ${href}`,
		provider: 'adguard' as const,
		href,
		credential: 'admin:secret',
	};
}

const raw: AdguardWire = {
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

/** `raw` as the readings a box renders, in render order. */
const projected = [
	{
		key: 'dns-queries',
		value: 1234,
	},
	{
		key: 'blocked',
		value: 56,
	},
	{
		key: 'avg-latency',
		value: 12,
	},
	{
		key: 'top-blocked-domain',
		value: 'ads.example.com',
	},
];

const piholeV5: PiholeV5Wire = {
	dns_queries_today: 1234,
	ads_blocked_today: 56,
	ads_percentage_today: 4.5,
	domains_being_blocked: 104756,
};

const piholeV6: PiholeV6Wire = {
	queries: {
		total: 1234,
		blocked: 56,
		percent_blocked: 4.5,
	},
	gravity: {
		domains_being_blocked: 104756,
	},
};

/**
 * Three monitors: one up, one down, one in maintenance — which is the case the projection
 * counts up and down separately for.
 */
const uptimeKuma: UptimeKumaWire = {
	heartbeatList: {
		'1': [
			{
				status: 0,
			},
			{
				status: 1,
			},
		],
		'2': [
			{
				status: 1,
			},
			{
				status: 0,
			},
		],
		'3': [
			{
				status: 3,
			},
		],
	},
	uptimeList: {
		'1_24': 1,
		'2_24': 0.5,
		'3_24': 0.75,
	},
};

/**
 * One node online beside its guests — running, stopped, a template, and an entry that is
 * neither node nor guest (`sdn`, which the same call returns).
 */
const proxmox: ProxmoxWire = {
	data: [
		{
			type: 'node',
			status: 'online',
			cpu: 0.1,
			mem: 30_000_000_000,
			maxmem: 60_000_000_000,
		},
		{
			type: 'vm',
			status: 'running',
		},
		{
			type: 'vm',
			status: 'stopped',
		},
		{
			type: 'vm',
			status: 'stopped',
			template: 1,
		},
		{
			type: 'sdn',
			status: 'ok',
		},
	],
};

const openMeteo: OpenMeteoWire = {
	current: {
		temperature_2m: 18.7,
		apparent_temperature: 17.2,
		relative_humidity_2m: 63,
		precipitation: 0.2,
		wind_speed_10m: 11.4,
	},
};

/**
 * Three sessions: one playing, one idling without the key, one carrying it as null —
 * both idle forms on one wire, because clients report "not playing" either way.
 */
const jellyfin: JellyfinWire = [
	{
		NowPlayingItem: {},
	},
	{
		NowPlayingItem: null,
	},
	{
		NowPlayingItem: null,
	},
];

const jellyfinWatching: JellyfinWire = [
	...jellyfin,
	{
		// Paused, but the session still holds its item: an active seat, not a closed one.
		NowPlayingItem: {},
	},
];

const failure = {
	message: 'answered 200 with a body that is not stats',
};

describe('projectAdguard', () => {
	it('maps the counters and converts seconds to whole milliseconds', () => {
		expect(projectAdguard(raw)).toEqual(projected);
	});

	it('falls back to a dash when AdGuard reports no blocked domains', () => {
		expect(
			projectAdguard({
				...raw,
				top_blocked_domains: [],
			}),
		).toContainEqual({
			key: 'top-blocked-domain',
			value: '–',
		});
	});
});

/**
 * The two Pi-hole projections read the same four readings off wires that share no field
 * name, which is why the version is a provider token rather than a prop: there is no
 * shared body for one to have wrapped.
 */
describe('projectPiholeV5', () => {
	it('maps the counters and turns the percentage into the fraction the key names', () => {
		expect(projectPiholeV5(piholeV5)).toEqual([
			{
				key: 'dns-queries',
				value: 1234,
			},
			{
				key: 'blocked',
				value: 56,
			},
			{
				key: 'blocked-share',
				value: 0.045,
			},
			{
				key: 'blocklist-domains',
				value: 104756,
			},
		]);
	});
});

describe('projectPiholeV6', () => {
	it('reads the same four readings out of v6 nesting', () => {
		expect(projectPiholeV6(piholeV6)).toEqual(projectPiholeV5(piholeV5));
	});
});

describe('projectUptimeKuma', () => {
	// The beats arrive oldest-first, so the LAST one is the current state — reading the
	// first would report every monitor's state as of a hundred beats ago.
	it('counts each monitor by its most recent heartbeat', () => {
		expect(projectUptimeKuma(uptimeKuma)).toContainEqual({
			key: 'monitors-up',
			value: 1,
		});

		expect(projectUptimeKuma(uptimeKuma)).toContainEqual({
			key: 'monitors-down',
			value: 1,
		});
	});

	// Up and down are counted separately rather than one being the remainder, so the
	// maintenance monitor above is in neither total.
	it('leaves a monitor that is neither up nor down out of both counts', () => {
		const [up, down] = projectUptimeKuma(uptimeKuma);

		expect(Number(up.value) + Number(down.value)).toBe(2);
	});

	it('averages the per-monitor 24h uptimes, as the fraction the key names', () => {
		expect(projectUptimeKuma(uptimeKuma)).toContainEqual({
			key: 'uptime-24h',
			value: 0.75,
		});
	});

	// A status page with no public monitors answers `{}`, and 0/0 renders as "NaN%".
	it('reports zero uptime for a status page with no monitors rather than NaN', () => {
		expect(
			projectUptimeKuma({
				heartbeatList: {},
				uptimeList: {},
			}),
		).toContainEqual({
			key: 'uptime-24h',
			value: 0,
		});
	});
});

describe('projectProxmox', () => {
	it('counts running and stopped guests, leaving the template out of both', () => {
		expect(projectProxmox(proxmox)).toContainEqual({
			key: 'guests-running',
			value: 1,
		});

		expect(projectProxmox(proxmox)).toContainEqual({
			key: 'guests-stopped',
			value: 1,
		});
	});

	it('reads CPU as the mean across online nodes, as the fraction the key names', () => {
		expect(projectProxmox(proxmox)).toContainEqual({
			key: 'cpu-share',
			value: 0.1,
		});
	});

	it('aggregates memory as used of total rather than a mean of shares', () => {
		expect(projectProxmox(proxmox)).toContainEqual({
			key: 'memory-share',
			value: 0.5,
		});
	});

	// A cluster answering with no online node must render 0%, not "NaN%" — the same
	// empty-answer guard Uptime Kuma's mean uptime carries.
	it('reports zero load for no online nodes rather than NaN', () => {
		expect(
			projectProxmox({
				data: [
					{
						type: 'vm',
						status: 'running',
					},
				],
			}),
		).toEqual([
			{
				key: 'guests-running',
				value: 1,
			},
			{
				key: 'guests-stopped',
				value: 0,
			},
			{
				key: 'cpu-share',
				value: 0,
			},
			{
				key: 'memory-share',
				value: 0,
			},
		]);
	});
});

/**
 * The dimensionals go over untouched — their unit is whatever the operator pinned into
 * the href, and this layer never sees it — while humidity normalizes to the fraction its
 * key names, because a share has no unit system to preserve.
 */
describe('projectOpenMeteo', () => {
	it('maps the current block verbatim and turns humidity into the fraction the key names', () => {
		expect(projectOpenMeteo(openMeteo)).toEqual([
			{
				key: 'temperature',
				value: 18.7,
			},
			{
				key: 'apparent-temperature',
				value: 17.2,
			},
			{
				key: 'humidity',
				value: 0.63,
			},
			{
				key: 'wind-speed',
				value: 11.4,
			},
			{
				key: 'precipitation',
				value: 0.2,
			},
		]);
	});
});

describe('projectJellyfin', () => {
	it('counts the sessions carrying a NowPlayingItem, in both idle forms', () => {
		expect(projectJellyfin(jellyfinWatching)).toEqual([
			{
				key: 'streams-active',
				value: 2,
			},
		]);
	});

	it('answers zero for a server with nothing playing rather than NaN or an error', () => {
		expect(
			projectJellyfin([
				{
					NowPlayingItem: null,
				},
				{
					NowPlayingItem: null,
				},
			]),
		).toEqual([
			{
				key: 'streams-active',
				value: 0,
			},
		]);
	});
});

describe('readStats', () => {
	beforeEach(() => {
		vi.mocked($getAdguardStats).mockReset();
		// The cache keys on `Date.now()`, so the window is walked rather than waited out.
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	/**
	 * Compile-time completeness is `Record<ProviderName, ReadProvider>` — a token with no
	 * reader does not build. This is the runtime half of the same claim: a token the schema
	 * accepts reaches a reader rather than `providers[name]` being `undefined` and throwing
	 * a TypeError out of the load.
	 */
	it('has a reader for every provider a config may name', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);
		vi.mocked($getPiholeV5Stats).mockResolvedValue([null, piholeV5]);
		vi.mocked($getPiholeV6Stats).mockResolvedValue([null, piholeV6]);
		vi.mocked($getUptimeKumaStats).mockResolvedValue([null, uptimeKuma]);
		vi.mocked($getProxmoxStats).mockResolvedValue([null, proxmox]);
		vi.mocked($getOpenMeteoStats).mockResolvedValue([null, openMeteo]);
		vi.mocked($getJellyfinStats).mockResolvedValue([null, jellyfin]);

		for (const provider of providerNames) {
			const read = await readStats({
				key: `registry ${provider}`,
				provider,
				href: 'http://registry.local',
			});

			expect(read.result).toHaveLength(2);
		}
	});

	it('hands the repository error back untouched', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([failure, null]);

		const [err, stats] = (await readStats(input('http://untouched.local'))).result;

		expect(stats).toBeNull();
		expect(err).toBe(failure);
	});

	it('projects a successful read', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);

		const read = await readStats(input('http://projected.local'));

		expect(read.isFresh).toBe(true);
		expect(read.result).toEqual([null, projected]);
	});

	/**
	 * The bound belongs to the read and not to the wire, so it is minted here and handed
	 * down — a provider needing two round trips would otherwise spend a per-fetch bound
	 * twice. Asserting the VALUE, not just that a signal exists: `AbortSignal.timeout` runs
	 * on an internal timer no fake clock reaches, so an "is it aborted yet" assertion passes
	 * at any bound, including none worth having.
	 */
	it('bounds the whole read at 3s, so an unreachable host cannot stall the page load', async () => {
		const timeout = vi.spyOn(AbortSignal, 'timeout');

		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);

		await readStats(input('http://bounded.local'));

		expect(timeout).toHaveBeenCalledWith(3000);

		expect(vi.mocked($getAdguardStats).mock.calls[0][0].signal).toBe(timeout.mock.results[0].value);
	});

	it('passes the credential the caller resolved through to the provider', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);

		await readStats(input('http://credentialed.local'));

		expect($getAdguardStats).toHaveBeenCalledWith(
			expect.objectContaining({
				href: 'http://credentialed.local',
				credential: 'admin:secret',
			}),
		);
	});

	it('serves a second read inside the window from the cache', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);

		await readStats(input('http://cached.local'));

		vi.advanceTimersByTime(STATS_TTL_MS - 1);

		const second = await readStats(input('http://cached.local'));

		expect($getAdguardStats).toHaveBeenCalledOnce();
		expect(second.result).toEqual([null, projected]);
		expect(second.isFresh).toBe(false);
	});

	/**
	 * The half #16 is about: a host that is switched off is the one paying the 3s bound, so
	 * caching only successes would leave every request paying it. `isFresh` false is what
	 * stops the route re-printing the same failure each time.
	 */
	it('serves a cached FAILURE inside the window, and does not re-report it', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([failure, null]);

		const first = await readStats(input('http://dead.local'));

		vi.advanceTimersByTime(STATS_TTL_MS - 1);

		const second = await readStats(input('http://dead.local'));

		expect($getAdguardStats).toHaveBeenCalledOnce();
		expect(first.isFresh).toBe(true);
		expect(second.isFresh).toBe(false);
		expect(second.result[0]).toBe(failure);
	});

	it('reads again once the window has passed', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([failure, null]);

		await readStats(input('http://expiring.local'));

		vi.advanceTimersByTime(STATS_TTL_MS);

		const second = await readStats(input('http://expiring.local'));

		expect($getAdguardStats).toHaveBeenCalledTimes(2);
		expect(second.isFresh).toBe(true);
	});

	// Keyed per instance rather than as one blob, so a page holding a dead instance beside
	// a live one does not cost the live one its entry on every read.
	it('does not let a dead instance evict a live one', async () => {
		vi.mocked($getAdguardStats).mockImplementation(async ({ href }) =>
			href === 'http://live.local' ? [null, raw] : [failure, null],
		);

		await readStats(input('http://live.local'));
		await readStats(input('http://dead.other'));

		const live = await readStats(input('http://live.local'));

		expect($getAdguardStats).toHaveBeenCalledTimes(2);
		expect(live.isFresh).toBe(false);
		expect(live.result).toEqual([null, projected]);
	});

	/**
	 * Why the cache key carries the provider. Two boxes at one href with different providers
	 * is a real config — a Pi-hole migrated from v5 to v6 answers both — and an href-keyed
	 * cache would hand one provider's readings to the other: not a collision, wrong numbers.
	 */
	it('keeps two providers at one href apart', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);

		const href = 'http://shared.local';

		await readStats({
			key: `adguard ${href}`,
			provider: 'adguard',
			href,
		});

		const other = await readStats({
			key: `other ${href}`,
			provider: 'adguard',
			href,
		});

		// A second read went out for the second key: the first one's entry did not answer
		// for it.
		expect($getAdguardStats).toHaveBeenCalledTimes(2);
		expect(other.isFresh).toBe(true);
	});
});

/**
 * The fold both callers share — the page load for first paint, `/api/stats` for every
 * refresh tick. The repositories are mocked whole (the describes above cover the reads),
 * so what this one pins is the PLANNING: credential resolution against the environment
 * record handed in, the skip-not-fail rule for an unset variable, and which failures
 * earn a log line.
 */
describe('readStatsFor', () => {
	beforeEach(() => {
		vi.mocked($getAdguardStats).mockReset();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function target(href: string) {
		return {
			key: statsKey('adguard', href),
			provider: 'adguard' as const,
			href,
		};
	}

	it('folds successful reads into stats, keyed per target', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);

		const href = 'http://folded.local';
		const fold = await readStatsFor([target(href)], {});

		expect(fold.stats).toEqual({
			[statsKey('adguard', href)]: projected,
		});

		expect(fold.failed).toEqual([]);
		expect(fold.errors).toEqual([]);
		expect(fold.warnings).toEqual([]);
	});

	// The secret scheme's mangling rule, tested where it now lives: `DASHBOARD_SECRET_`
	// plus the target's value VERBATIM. Folding case or punctuation would invent
	// collisions whose failure mode is the wrong credential, silently.
	it('resolves the credential from the variable the target names, verbatim', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);

		const href = 'http://credentialed-fold.local';

		await readStatsFor(
			[
				{
					...target(href),
					secret: 'Folded_Main',
				},
			],
			{
				DASHBOARD_SECRET_Folded_Main: 'admin:secret',
			},
		);

		expect($getAdguardStats).toHaveBeenCalledWith(
			expect.objectContaining({
				href,
				credential: 'admin:secret',
			}),
		);
	});

	/**
	 * An absence, not a failure: a variable the config names and nobody set is the
	 * operator's own setup decision, so the target is skipped — not read, not reported —
	 * and costs exactly one warning line, once per variable per process.
	 */
	it('skips a target whose variable is unset, warning once per process', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);

		const href = 'http://unset-secret.local';

		const targets = [
			{
				...target(href),
				secret: 'UNSET_ONCE',
			},
		];

		const first = await readStatsFor(targets, {});

		expect($getAdguardStats).not.toHaveBeenCalled();
		expect(first.stats).toEqual({});
		expect(first.failed).toEqual([]);

		expect(first.warnings).toEqual([
			'DASHBOARD_SECRET_UNSET_ONCE is not set, skipping http://unset-secret.local',
		]);

		const second = await readStatsFor(targets, {});

		expect(second.warnings).toEqual([]);
	});

	it('reads a target that names no secret at all, anonymously', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([null, raw]);

		const fold = await readStatsFor([target('http://anonymous.local')], {});

		expect($getAdguardStats).toHaveBeenCalledWith(
			expect.objectContaining({
				credential: undefined,
			}),
		);

		expect(Object.keys(fold.stats)).toHaveLength(1);
	});

	// One box down does not blank the one that answered, and the failure crosses as
	// data — key, provider, href — with the failed key ABSENT from stats, so its box
	// renders its unavailable line rather than blanks.
	it('keeps the instances that answered when another one did not', async () => {
		vi.mocked($getAdguardStats).mockImplementation(async ({ href }) =>
			href === 'http://live-fold.local' ? [null, raw] : [failure, null],
		);

		const fold = await readStatsFor(
			[target('http://live-fold.local'), target('http://dead-fold.local')],
			{},
		);

		expect(fold.stats).toEqual({
			[statsKey('adguard', 'http://live-fold.local')]: projected,
		});

		expect(fold.failed).toEqual([
			{
				key: statsKey('adguard', 'http://dead-fold.local'),
				provider: 'adguard',
				href: 'http://dead-fold.local',
			},
		]);
	});

	/**
	 * Only what actually went to the network earns a log line: a failure served again
	 * from the TTL cache still fails its box, but a refreshing tab must not re-print it
	 * once per request. The window is walked with fake timers, as in `readStats` above.
	 */
	it('logs a fresh failure but not a cached one', async () => {
		vi.mocked($getAdguardStats).mockResolvedValue([failure, null]);

		const href = 'http://logged-once.local';
		const targets = [target(href)];
		const first = await readStatsFor(targets, {});
		expect(first.errors).toEqual([failure.message]);

		vi.advanceTimersByTime(STATS_TTL_MS - 1);

		const second = await readStatsFor(targets, {});
		expect(second.errors).toEqual([]);
		expect(second.failed).toHaveLength(1);

		vi.advanceTimersByTime(1);

		const third = await readStatsFor(targets, {});
		expect(third.errors).toEqual([failure.message]);
	});
});
