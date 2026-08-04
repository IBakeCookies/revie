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

import { $readConfigFile, $readConfigMtime } from '$lib/data/config';
import { type Config, emptyConfig, normalizeConfig } from '$lib/business/model/config';

let cache: { mtimeMs: number; config: Config } | undefined;

export async function readConfig(): Promise<Config> {
	const [statError, mtimeMs] = await $readConfigMtime();

	// A config that has become unreadable must not blank the dashboard: keep serving
	// the last good one, and only fall back to empty if there never was one.
	if (statError) {
		console.error(statError.message, statError.cause ?? '');

		return cache?.config ?? emptyConfig;
	}

	if (cache?.mtimeMs === mtimeMs) {
		return cache.config;
	}

	const [readError, raw] = await $readConfigFile();

	if (readError) {
		console.error(readError.message, readError.cause ?? '');

		return cache?.config ?? emptyConfig;
	}

	cache = { mtimeMs, config: normalizeConfig(raw) };

	return cache.config;
}
