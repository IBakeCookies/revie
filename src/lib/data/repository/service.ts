import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

export interface GetServiceStateOutput {
	isAlive: boolean;
}

/**
 * The endpoint probes with a 2s bound of its own, so anything past this is our
 * own server stalling rather than a slow service. Unbounded, that stall never
 * settles: the dot keeps its last value forever while the poll fires again
 * every 15 minutes.
 */
const REQUEST_TIMEOUT_MS = 5000;

export async function $getServiceState(href: string): Promise<Result<GetServiceStateOutput>> {
	return useAsyncErrorAsValue(async () => {
		const raw = await fetch('/api/ping', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				href,
			}),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});

		if (!raw.ok) {
			throw new Error(`Ping responded with ${raw.status} ${raw.statusText}`);
		}

		return raw.json();
	}, `Could not reach ${href}`);
}
