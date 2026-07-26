/**
 * Reading the dashboard config file. I/O only — no validation, no shaping, no
 * caching. What the bytes MEAN is business's problem, in
 * `business/config-source.ts`; this layer fetches them and hands back whatever
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

/** When the file last changed — the cheap call, used to decide whether to re-read. */
export async function $readConfigMtime(): Promise<Result<number>> {
	return useAsyncErrorAsValue(
		async () => (await stat(configPath)).mtimeMs,
		`Could not reach the dashboard config at "${configPath}"`
	);
}

export async function $readConfigFile(): Promise<Result<unknown>> {
	return useAsyncErrorAsValue(
		async () => JSON.parse(await readFile(configPath, 'utf8')),
		`Could not read the dashboard config at "${configPath}"`
	);
}
