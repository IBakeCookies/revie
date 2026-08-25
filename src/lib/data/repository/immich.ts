import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * `/server/statistics`, transcribed from Immich's OpenAPI schema
 * (`ServerStatsResponseDto`) and **not exercised against a live instance** — roadmap
 * #33's own instruction, and true of every provider that lands under it.
 *
 * Only what the projection reads is declared. Valibot's output drops what nobody
 * declared, so the byte counts (`usage`, `usagePhotos`, `usageVideos`) and the
 * per-user breakdown cannot reach a projection that validated nothing about them.
 */
const statisticsSchema = v.object({
	photos: v.number(),
	videos: v.number(),
});

export type ImmichWire = v.InferOutput<typeof statisticsSchema>;

export type GetImmichStatsInput = {
	/** Base URL of the instance — `https://immich.lan:2283`. The path is appended. */
	href: string;
	/**
	 * An API key, from Account Settings → API Keys. Since Immich v1.137 keys are scoped,
	 * and this one needs the `server.statistics` permission; older instances accept any
	 * key. Without one the read goes anonymous.
	 */
	credential?: string;
	/** The whole read's budget, minted by business. */
	signal: AbortSignal;
};

export function $getImmichStats({
	href,
	credential,
	signal,
}: GetImmichStatsInput): Promise<Result<ImmichWire>> {
	return useAsyncErrorAsValue(async () => {
		const raw = await fetch(`${href}/server/statistics`, {
			headers: credential
				? {
						'x-api-key': credential,
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
			throw new Error(`Immich responded with ${raw.status} ${raw.statusText}`);
		}

		const parsed = v.safeParse(statisticsSchema, await raw.json());

		if (!parsed.success) {
			throw new Error('answered 200 with a body that is not stats');
		}

		return parsed.output;
	}, `Could not read Immich stats from ${href}`);
}
