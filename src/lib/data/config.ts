/**
 * Reading the dashboard config file. I/O only — no validation, no shaping, no
 * caching. What the bytes MEAN is business's problem, in
 * `business/model/config-source.ts`; this layer fetches them and hands back whatever
 * happened.
 *
 * The file lives outside `static/` on purpose: it is data read at runtime, not a
 * build artifact, and keeping it out of the build tree makes clear that nothing in
 * it can reach the Tailwind compiler.
 */

import { readFile, stat } from 'node:fs/promises';
import { env } from '$env/dynamic/private';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

const configPath = env.DASHBOARD_CONFIG || 'config.json';

/** What the file looks like from the outside — both halves ride on one `stat`. */
export interface ConfigStamp {
	mtimeMs: number;
	size: number;
}

/** The cheap call, used to decide whether to re-read. */
export async function $readConfigStamp(): Promise<Result<ConfigStamp>> {
	return useAsyncErrorAsValue(async () => {
		const { mtimeMs, size } = await stat(configPath);

		return {
			mtimeMs,
			size,
		};
	}, `Could not reach the dashboard config at "${configPath}"`);
}

export async function $readConfigFile(): Promise<Result<unknown>> {
	return useAsyncErrorAsValue(
		async () => JSON.parse(await readFile(configPath, 'utf8')),
		`Could not read the dashboard config at "${configPath}"`,
	);
}
