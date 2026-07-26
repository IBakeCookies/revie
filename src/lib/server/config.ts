import { readFile, stat } from 'node:fs/promises';
import { env } from '$env/dynamic/private';
import { type Config, emptyConfig, normalizeConfig } from '$lib/utils/config';

/**
 * The config lives outside `static/` on purpose: it is data read at runtime, not a
 * build artifact, and keeping it out of the build tree makes clear that nothing in
 * it can reach the Tailwind compiler.
 */
const configPath = env.DASHBOARD_CONFIG || 'config.json';

let cache: { mtimeMs: number; config: Config } | undefined;

export async function readConfig(): Promise<Config> {
	try {
		const { mtimeMs } = await stat(configPath);

		if (cache?.mtimeMs !== mtimeMs) {
			cache = {
				mtimeMs,
				config: normalizeConfig(JSON.parse(await readFile(configPath, 'utf8')))
			};
		}

		return cache.config;
	} catch (error) {
		console.error(`Could not read dashboard config from "${configPath}":`, error);

		return cache?.config ?? emptyConfig;
	}
}
