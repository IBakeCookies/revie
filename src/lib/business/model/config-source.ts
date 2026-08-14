/**
 * The dashboard config as the rest of the app receives it: read through the data
 * layer, validated, and cached until the file changes.
 *
 * Server-only, because it reaches the filesystem — which is exactly why it is kept
 * apart from `business/model/config.ts`. That module is the browser-safe model (types,
 * guards, queries) and is imported by components and by the polling helper; if the
 * two lived together, every client bundle would try to pull in `node:fs` and
 * `$env/dynamic/private`.
 *
 * The cache holds the NORMALIZED config rather than the bytes: normalizing is the
 * expensive half, and it is the part every request would otherwise repeat.
 */

import { type ConfigStamp, $readConfigFile, $readConfigStamp } from '$lib/data/config';
import { type Config, emptyConfig, normalizeConfig } from '$lib/business/model/config';

let cache: { stamp: ConfigStamp; config: Config } | undefined;

export async function readConfig(): Promise<Config> {
	const [statError, stamp] = await $readConfigStamp();

	// A config that has become unreadable must not blank the dashboard: keep serving
	// the last good one, and only fall back to empty if there never was one.
	if (statError) {
		console.error(statError.message, statError.cause ?? '');

		return cache?.config ?? emptyConfig;
	}

	// Size as well as mtime, because mtime alone is not evidence of sameness: `cp -p` and
	// a coarse mtime tick (drvfs, some network volumes) both serve a changed file forever.
	// This narrows that window, it does not close it — a same-size edit within one tick is
	// still stale — and hashing the bytes would cost a full read per request, which is the
	// only thing the cache buys.
	if (cache?.stamp.mtimeMs === stamp.mtimeMs && cache?.stamp.size === stamp.size) {
		return cache.config;
	}

	const [readError, raw] = await $readConfigFile();

	if (readError) {
		console.error(readError.message, readError.cause ?? '');

		// Cache the failure against the stamp that produced it. A broken file under
		// sustained traffic otherwise costs a read, a parse and a log line on EVERY
		// request; fixing it changes the stamp, so the retry still happens.
		cache = {
			stamp,
			config: cache?.config ?? emptyConfig,
		};

		return cache.config;
	}

	cache = {
		stamp,
		config: normalizeConfig(raw),
	};

	return cache.config;
}
