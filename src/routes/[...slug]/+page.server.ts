import type { ConfigContainer, ProviderName, StatsTarget } from '$lib/business/model/config';
import type { PageServerLoad } from './$types';
import type { Stat } from '$lib/business/type/stats';
import type { FeedItem } from '$lib/business/type/feed';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	collectFeedTargets,
	collectServiceLinks,
	collectStatsTargets,
	pageEntries,
} from '$lib/business/model/config';
import { readConfig } from '$lib/business/model/config-source';
import { readStats } from '$lib/business/model/stats';
import { readFeed } from '$lib/business/model/feed';

/**
 * A stats box names the VARIABLE holding its credential, never the credential — so two
 * instances of one provider can have two logins and `config.json` never holds a secret.
 * The config's value is appended VERBATIM: folding case or punctuation would invent
 * collisions whose failure mode is the wrong credential, silently, while verbatim lets
 * the diagnostic below name the literal key it looked up.
 */
const SECRET_PREFIX = 'DASHBOARD_SECRET_';
/**
 * Which secret variables have already been reported missing. `$env/dynamic/private`
 * cannot change without a restart, so each variable has exactly one thing to say per
 * process — ungated it printed once per request, which the 60s refresh turns into once a
 * minute per open tab. Bounded by `config.json`, like the stats cache, so it is not pruned.
 */
const warnedSecrets = new Set<string>();

/**
 * Which box could not be read, named the way the page has to name it. Not one flag and
 * not a provider list: readings are keyed per INSTANCE, so "Pi-hole is down" is true,
 * useless and indistinguishable from both Pi-holes being down. The href is what
 * identifies the box a user is looking at, and `service_probe_failed({ href })` is the
 * standing precedent that an href is DATA crossing a layer, not copy.
 */
export type StatsFailure = {
	/** The same key the readings are recorded under, so the page can dedupe on it. */
	key: string;
	provider: ProviderName;
	href: string;
};

type StatsJob = {
	target: StatsTarget;
	credential?: string;
};

/**
 * Which targets are worth reading, and with what. A target that names a variable which is
 * not set is SKIPPED — not read, not flagged, not toasted — because that is an operator's
 * own setup decision and toasting it would put it in front of every visitor on every page
 * load. A target that names no variable at all is read anonymously: right for a provider
 * that needs no credential, and a provider that does answers 401, which is an ordinary
 * failure and says so.
 */
function planReads(targets: StatsTarget[]): StatsJob[] {
	const jobs: StatsJob[] = [];

	for (const target of targets) {
		if (!target.secret) {
			jobs.push({
				target,
			});

			continue;
		}

		const name = `${SECRET_PREFIX}${target.secret}`;
		const credential = env[name];

		if (!credential) {
			if (!warnedSecrets.has(name)) {
				warnedSecrets.add(name);

				console.warn(`${name} is not set, skipping ${target.href}`);
			}

			continue;
		}

		jobs.push({
			target,
			credential,
		});
	}

	return jobs;
}

async function loadStats(containers: ConfigContainer[]): Promise<{
	stats: Record<string, Stat[]>;
	failed: StatsFailure[];
}> {
	// Concurrent, so the 3s bound stays the cost of the whole read rather than of each
	// instance in turn — three dead boxes must not gate first byte for 9s. Collected first
	// and folded after, so the log lines and the keys come out in config order rather than
	// in whatever order the hosts happened to answer.
	const reads = await Promise.all(
		planReads(collectStatsTargets(containers)).map(
			async ({ target, credential }) =>
				[
					target,
					await readStats({
						key: target.key,
						provider: target.provider,
						href: target.href,
						credential,
					}),
				] as const,
		),
	);

	const stats: Record<string, Stat[]> = {};
	const failed: StatsFailure[] = [];

	for (const [target, { result, isFresh }] of reads) {
		const [err, read] = result;

		// Logged AND reported, and the two carry different things. The log is the operator
		// channel: it names the host and the status, and outlives the tab. Both halves are
		// already in `err.message` — the repository passes the href as the context
		// `useAsyncErrorAsValue` prefixes — so prefixing it again here printed the host
		// twice. What crosses to the page is the provider and the href: the route turns
		// those into a translated line, because `err.message` is English minted in `data`.
		// Not `err.cause` in either: a bounded fetch's timeout arrives as a DOMException
		// whose stack is ten frames of undici internals naming neither the service nor the
		// host.
		//
		// Only what the read actually went to the network for, exactly as the config
		// diagnostics below are gated: the failure still crosses on a cached one — the box
		// is empty either way — while a dead box under a refreshing tab would otherwise
		// print once per request again.
		if (err) {
			if (isFresh) {
				console.error(err.message);
			}

			failed.push({
				key: target.key,
				provider: target.provider,
				href: target.href,
			});

			continue;
		}

		stats[target.key] = read;
	}

	return {
		stats,
		failed,
	};
}

/**
 * Which feed did not answer, as the page has to name it. The href is the whole identity
 * a feed read has — there is no provider token to disambiguate — and it doubles as the
 * key the readings are recorded under, so the page can dedupe on it.
 */
export type FeedFailure = string;

async function loadFeeds(containers: ConfigContainer[]): Promise<{
	feeds: Record<string, FeedItem[]>;
	failed: FeedFailure[];
}> {
	// Concurrent, so the 3s bound stays the cost of the whole read rather than of each
	// feed in turn — same reasoning as loadStats above. Collected first and folded after,
	// so the keys come out in config order rather than in whatever order the hosts
	// happened to answer.
	const reads = await Promise.all(
		collectFeedTargets(containers).map(
			async (href) =>
				[
					href,
					await readFeed({
						href,
					}),
				] as const,
		),
	);

	const feeds: Record<string, FeedItem[]> = {};
	const failed: FeedFailure[] = [];

	for (const [href, { result, isFresh }] of reads) {
		const [err, items] = result;

		// Logged AND reported, split exactly like the stats read above: the log names the
		// host and what was wrong with its answer and outlives the tab; what crosses to
		// the page is the bare href, which the route turns into a translated line. Gated
		// on `isFresh`, so a dead feed under a refreshing tab prints once per TTL window
		// rather than once per request.
		if (err) {
			if (isFresh) {
				console.error(err.message);
			}

			failed.push(href);

			continue;
		}

		feeds[href] = items;
	}

	return {
		feeds,
		failed,
	};
}

export const load: PageServerLoad = async ({ depends, url }) => {
	// The handle the client's refresh interval invalidates. `invalidate` re-runs the
	// WHOLE load, so `readConfig` runs again on every tick too — accepted: it is
	// mtime-cached, so a tick that changes nothing costs one `stat`.
	depends('dashboard:stats');

	const { config, warnings, error: configError, isFresh } = await readConfig();

	// Only what the file re-read actually turned up, so a broken config costs one log
	// per mtime instead of one per request. Two concurrent first hits can still log
	// twice; an in-flight promise cache to dedupe that race is more machinery than one
	// duplicate pair is worth.
	if (isFresh) {
		if (configError) {
			console.error(configError.message, configError.cause ?? '');
		}

		for (const warning of warnings) {
			console.warn(warning);
		}
	}

	const page = config.pages[url.pathname];

	// A config that could not be read is not a wrong URL. Answering 404 for it blamed
	// the address bar for a file the server could not open, which is the one thing the
	// operator needed to be told.
	if (!page && configError) {
		error(503, 'The dashboard config could not be read');
	}

	if (!page) {
		error(404, `No dashboard page is configured for "${url.pathname}"`);
	}

	const [stats, feeds] = await Promise.all([
		loadStats(page.containers),
		loadFeeds(page.containers),
	]);

	return {
		// The jump targets the quick-jump filters over. Both are plain data: every
		// candidate is already in memory, so there is no endpoint and no search to
		// run server-side — presentation does the filtering against its own locale.
		pages: pageEntries(config),
		services: collectServiceLinks(page.containers),
		containers: page.containers,
		stats: stats.stats,
		// Data, not messages: the words belong to presentation, which has the locale.
		// One entry per instance that was asked and did not answer, so a page holding two
		// stats boxes can say which of them is the empty one.
		failedStats: stats.failed,
		feeds: feeds.feeds,
		failedFeeds: feeds.failed,
	};
};
