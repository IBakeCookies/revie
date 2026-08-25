import type { RequestHandler } from './$types';
import type { StatsTarget } from '$lib/business/model/config';
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { readConfig } from '$lib/business/model/config-source';
import { collectFeedTargets, collectStatsTargets } from '$lib/business/model/config';
import { readStatsFor } from '$lib/business/model/stats';
import { readFeedsFor } from '$lib/business/model/feed';

/**
 * The client-side refresh polls THIS, not the page load. It used to re-run the whole
 * load every minute via `invalidate('dashboard:stats')`, so one bad tick — a config
 * caught mid-write, a page key renamed under an open tab — swapped the dashboard for
 * the error page, and the unmounted page took its refresh interval with it: the tab
 * stayed wrong until a manual reload. Nothing here throws on config drift, so the
 * worst a tick can do is change nothing.
 *
 * The shape is `/api/ping`'s: the body NAMES instances and never gets to define them.
 * What a caller may ask about is what the operator configured; which provider reads
 * which URL and with what credential is already the server's decision, and no
 * credential ever crosses back out.
 */

/** Tolerates junk entries rather than rejecting the tick that carried them. */
function strings(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [];
}

/**
 * Everything any page's boxes may ask about, keyed the way the client names them: the
 * stats `statsKey(provider, href)` string and a feed's bare href. Across ALL pages,
 * like `/api/ping`'s map — the endpoint cannot know which page the caller sits on and
 * does not need to: a name not in here is skipped, and that is the whole guard.
 */
async function configuredTargets(): Promise<{
	stats: Map<string, StatsTarget>;
	feeds: Set<string>;
}> {
	const { config, error: configError } = await readConfig();

	// Same answer as the page load: an unreadable config is not an empty allowlist.
	// Answering 200-with-nothing would read as "nothing is configured" to a caller
	// that has no other way to tell.
	if (configError) {
		error(503, 'The dashboard config could not be read');
	}

	const stats = new Map<string, StatsTarget>();
	const feeds = new Set<string>();

	for (const page of Object.values(config.pages)) {
		for (const target of collectStatsTargets(page.containers)) {
			stats.set(target.key, target);
		}

		for (const href of collectFeedTargets(page.containers)) {
			feeds.add(href);
		}
	}

	return {
		stats,
		feeds,
	};
}

export const POST: RequestHandler = async ({ request }) => {
	const body: unknown = await request.json().catch(() => undefined);

	// Arrays are spelled out because `typeof` calls them objects — and an array is
	// valid JSON that would otherwise be answered with a silent empty success, which
	// is exactly the lie `[]` told normalizeConfig before #34 gave it its own guard.
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		error(400, 'Expected a body of { stats: string[], feeds: string[] }');
	}

	const record = body as Record<string, unknown>;
	const allow = await configuredTargets();

	// A requested instance that is not configured is SKIPPED rather than refused, and
	// the skip is deliberately quieter than /api/ping's 403. One stale key — a box the
	// operator just deleted under an open tab — must not take the tick's other answers
	// down with it, or config drift would freeze every live box until reload: a small
	// version of the park this endpoint exists to close. The silence also keeps the
	// endpoint from confirming unconfigured keys to a probing caller.

	// No rate limit, unlike /api/ping. There the cost per call was an unconditional
	// connect to a host; here the TTL cache bounds what ANY number of calls can spend
	// — each configured instance goes to the network at most once per window however
	// hard the endpoint is hit — and a cache hit costs a `stat` and two Map lookups.
	// If that ever stops being true, #45's budget is the precedent to reach for.

	const targets = strings(record.stats)
		.map((key) => allow.stats.get(key))
		.filter((target) => target !== undefined);

	const [statsFold, feedsFold] = await Promise.all([
		readStatsFor(targets, env),
		readFeedsFor(strings(record.feeds).filter((href) => allow.feeds.has(href))),
	]);

	// The operator channel rides along with the reads this endpoint performs — after
	// the first paint these are the only stats and feed reads going to the network,
	// so if they did not log here, a box dying under an open tab would toast but
	// never reach a journal. Gated inside the folds on `isFresh`, exactly like the
	// load's printing.
	for (const line of statsFold.errors) {
		console.error(line);
	}

	for (const line of statsFold.warnings) {
		console.warn(line);
	}

	for (const line of feedsFold.errors) {
		console.error(line);
	}

	return json({
		stats: statsFold.stats,
		failedStats: statsFold.failed,
		feeds: feedsFold.feeds,
		failedFeeds: feedsFold.failed,
	});
};
