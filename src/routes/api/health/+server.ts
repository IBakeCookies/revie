import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { readConfig } from '$lib/business/model/config-source';

/**
 * Readiness for a systemd `ExecStartPost` or a compose `HEALTHCHECK`: the config is
 * the one thing this app cannot run without, and until now an unreadable one only
 * showed up as a 404 on every page.
 *
 * The body is an operator channel, not user copy — nothing here is ever rendered, so
 * `AppError.message` is the right thing to hand back rather than a kind to translate.
 */
export const GET: RequestHandler = async () => {
	const { config, error, mtimeMs } = await readConfig();

	if (error) {
		return json(
			{
				error: error.message,
			},
			{
				status: 503,
			},
		);
	}

	return json({
		pages: Object.keys(config.pages).length,
		mtimeMs,
	});
};
