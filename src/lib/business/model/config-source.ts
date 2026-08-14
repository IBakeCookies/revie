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

import type { AppError } from '$lib/utils/useAsyncErrorAsValue';
import { type ConfigStamp, $readConfigFile, $readConfigStamp } from '$lib/data/config';
import { type Config, emptyConfig, normalizeConfig } from '$lib/business/model/config';

/**
 * The config plus everything that went wrong getting it. Nothing is printed here —
 * a model has no business deciding what a diagnostic is worth — so the problems
 * come back as values and `isFresh` tells the caller whether they are new.
 */
export type ConfigRead = {
	config: Config;
	warnings: string[];
	/** Retained beside the cache, so a broken file is reported once, not once per request. */
	error: AppError | null;
	/** null when the stat itself failed, so there is no stamp to name. */
	mtimeMs: number | null;
	/** true only on the call that actually re-read and re-parsed the file. */
	isFresh: boolean;
};

let cache: { stamp: ConfigStamp; read: Omit<ConfigRead, 'isFresh'> } | undefined;
/** The last stat failure, which has no mtime to be keyed on — so its message is the key. */
let retainedStatError: AppError | null = null;

export async function readConfig(): Promise<ConfigRead> {
	const [statError, stamp] = await $readConfigStamp();

	// A config that has become unreadable must not blank the dashboard: keep serving
	// the last good one, and only fall back to empty if there never was one.
	if (statError) {
		const isFresh = statError.message !== retainedStatError?.message;

		retainedStatError = statError;

		return {
			config: cache?.read.config ?? emptyConfig,
			warnings: [],
			error: statError,
			mtimeMs: null,
			isFresh,
		};
	}

	retainedStatError = null;

	// Size as well as mtime, because mtime alone is not evidence of sameness: `cp -p` and
	// a coarse mtime tick (drvfs, some network volumes) both serve a changed file forever.
	// This narrows that window, it does not close it — a same-size edit within one tick is
	// still stale — and hashing the bytes would cost a full read per request, which is the
	// only thing the cache buys.
	if (cache?.stamp.mtimeMs === stamp.mtimeMs && cache?.stamp.size === stamp.size) {
		return {
			...cache.read,
			isFresh: false,
		};
	}

	const [readError, raw] = await $readConfigFile();

	// Cache the failure against the stamp that produced it. A broken file under
	// sustained traffic otherwise costs a read, a parse and a log line on EVERY
	// request; fixing it changes the stamp, so the retry still happens.
	if (readError) {
		cache = {
			stamp,
			read: {
				config: cache?.read.config ?? emptyConfig,
				warnings: [],
				error: readError,
				mtimeMs: stamp.mtimeMs,
			},
		};

		return {
			...cache.read,
			isFresh: true,
		};
	}

	const { config, warnings } = normalizeConfig(raw);

	cache = {
		stamp,
		read: {
			config,
			warnings,
			error: null,
			mtimeMs: stamp.mtimeMs,
		},
	};

	return {
		...cache.read,
		isFresh: true,
	};
}
