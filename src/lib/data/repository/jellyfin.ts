import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * `/Sessions`, transcribed from Jellyfin's OpenAPI spec (`SessionInfo`) and **not
 * exercised against a live instance** — roadmap #33's own instruction, and true of
 * every provider that lands under it.
 *
 * A session is a connected DEVICE, not a playback: browsers parked on Jellyfin's own
 * dashboard are sessions for as long as they poll. The one thing that separates
 * watching from idling is `NowPlayingItem`, which is why it is the only field declared —
 * the projection reads nothing else, so naming inner fields would validate nothing
 * anyone reads. Clients that stopped playing either omit the key or send it as null,
 * which is exactly what `nullish` folds into one "not playing" value.
 */
const sessionSchema = v.object({
	NowPlayingItem: v.nullish(v.object({}), null),
});

const sessionsSchema = v.array(sessionSchema);

export type JellyfinWire = v.InferOutput<typeof sessionsSchema>;

export type GetJellyfinStatsInput = {
	/** Base URL of the instance — `https://jellyfin.lan`. `/Sessions` is appended. */
	href: string;
	/** An API key, from Dashboard → API Keys. Without one the read goes anonymous. */
	credential?: string;
	/**
	 * The whole read's budget, minted by business. Not a bound of the repository's own:
	 * a provider that needs two round trips would otherwise spend the bound twice.
	 */
	signal: AbortSignal;
};

export function $getJellyfinStats({
	href,
	credential,
	signal,
}: GetJellyfinStatsInput): Promise<Result<JellyfinWire>> {
	return useAsyncErrorAsValue(async () => {
		const raw = await fetch(`${href}/Sessions`, {
			// No header at all without a key — sending an empty one is not the same request
			// as sending none.
			headers: credential
				? {
						'X-Emby-Token': credential,
					}
				: {},
			signal,
			// The API key rides a custom header, which a redirect strips neither — following
			// one would hand the credential to a host the operator never configured. Same
			// reason both Pi-holes refuse.
			redirect: 'manual',
		});

		// fetch only rejects on network errors, so an auth failure would otherwise
		// surface as an unrelated JSON parse error.
		if (!raw.ok) {
			throw new Error(`Jellyfin responded with ${raw.status} ${raw.statusText}`);
		}

		const parsed = v.safeParse(sessionsSchema, await raw.json());

		if (!parsed.success) {
			throw new Error('answered 200 with a body that is not stats');
		}

		return parsed.output;
	}, `Could not read Jellyfin stats from ${href}`);
}
