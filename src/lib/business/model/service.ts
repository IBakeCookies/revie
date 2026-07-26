/**
 * Whether a configured service is answering.
 *
 * The domain rule this file exists to state: a probe that FAILS is not the same
 * as a service that is DOWN. An unreachable endpoint, a network blip or a 500
 * tells us nothing about the service, so that case comes back as an error —
 * NOT as `false`. Rendering a red dot there would be a lie.
 *
 * The error is returned, never logged or swallowed here. Deciding what a
 * failure means for the user — log it, toast it, keep the last known value —
 * belongs to whoever is holding the state, not to this function.
 */

import { getServiceState } from '$lib/data/repository/service';
import type { Result } from '$lib/utils/useAsyncErrorAsValue';

export async function readServiceState(href: string): Promise<Result<boolean>> {
	const [err, res] = await getServiceState(href);

	if (err) {
		return [err, null];
	}

	return [null, res.isAlive];
}
