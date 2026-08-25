import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * The *arr download queue, transcribed from Sonarr's published API docs and **not
 * exercised against a live instance** — roadmap #33's own instruction, true of every
 * provider under it.
 *
 * One reader for the three apps because they answer one envelope — `{ page, pageSize,
 * sortKey, sortDirection, totalRecords, records }`, the *arr paging wrapper — and differ
 * in exactly two facts this module owns per product: the API version in the path
 * (Sonarr and Radarr are v3, Prowlarr is v1) and the name the error message carries.
 * Three files would be three declarations of the same wire shape, which is the
 * duplication the "one definition per concept" rule exists for.
 *
 * Only what the projection reads is declared. `totalRecords` is the WHOLE queue's size
 * whatever page size the server picked, so the default 10-record page costs nothing and
 * no query string is sent at all.
 */
const queueSchema = v.object({
	totalRecords: v.number(),
});

export type ArrWire = v.InferOutput<typeof queueSchema>;

export type GetArrStatsInput = {
	/** Base URL of the instance — `https://sonarr.lan:8989`. The queue path is appended. */
	href: string;
	/** An API key, from Settings → General → Security. Without one the read goes anonymous. */
	credential?: string;
	/**
	 * The whole read's budget, minted by business. Not a bound of the repository's own:
	 * a provider that needs two round trips would otherwise spend the bound twice.
	 */
	signal: AbortSignal;
};

function getArrQueue(product: string, path: string) {
	return function getQueue({
		href,
		credential,
		signal,
	}: GetArrStatsInput): Promise<Result<ArrWire>> {
		return useAsyncErrorAsValue(async () => {
			const raw = await fetch(`${href}${path}`, {
				headers: credential
					? {
							'X-Api-Key': credential,
						}
					: {},
				signal,
				// The key rides a custom header, which a redirect strips neither — following
				// one would hand the credential to a host the operator never configured. Same
				// reason Jellyfin and both Pi-holes refuse.
				redirect: 'manual',
			});

			// fetch only rejects on network errors, so an auth failure would otherwise
			// surface as an unrelated JSON parse error.
			if (!raw.ok) {
				throw new Error(`${product} responded with ${raw.status} ${raw.statusText}`);
			}

			const parsed = v.safeParse(queueSchema, await raw.json());

			if (!parsed.success) {
				throw new Error('answered 200 with a body that is not stats');
			}

			return parsed.output;
		}, `Could not read ${product} stats from ${href}`);
	};
}

export const $getSonarrStats = getArrQueue('Sonarr', '/api/v3/queue');

export const $getRadarrStats = getArrQueue('Radarr', '/api/v3/queue');

export const $getProwlarrStats = getArrQueue('Prowlarr', '/api/v1/queue');
