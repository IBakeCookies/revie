import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	collectFeedTargets,
	collectServiceLinks,
	collectStatsTargets,
	pageEntries,
} from '$lib/business/model/config';
import { readConfig } from '$lib/business/model/config-source';
import { readStatsFor } from '$lib/business/model/stats';
import { readFeedsFor } from '$lib/business/model/feed';

export const load: PageServerLoad = async ({ url }) => {
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

	// First paint is the only thing this load does for stats and feeds now — the
	// client's refresh polls `/api/stats`, which plans its own reads off the same two
	// functions. The fold hands back the operator's log lines with the data; printing
	// them here keeps the sink in the route, where every other diagnostic prints.
	const [stats, feeds] = await Promise.all([
		readStatsFor(collectStatsTargets(page.containers), env),
		readFeedsFor(collectFeedTargets(page.containers)),
	]);

	for (const line of stats.errors) {
		console.error(line);
	}

	for (const line of stats.warnings) {
		console.warn(line);
	}

	for (const line of feeds.errors) {
		console.error(line);
	}

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
