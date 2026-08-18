import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * Pi-hole 5's PHP admin API, transcribed from the vendor's documentation and **not
 * exercised against a live instance** — roadmap #33's own instruction.
 *
 * `summaryRaw` rather than `summary`: the latter returns the same numbers already
 * thousands-separated as STRINGS, so a schema of numbers would reject a healthy instance
 * and one of strings would hand the projection text to parse.
 *
 * v5 and v6 are separate providers rather than one with a version prop, because they share
 * no path, no auth and no field names — see `providerNames`.
 */
const summarySchema = v.object({
	dns_queries_today: v.number(),
	ads_blocked_today: v.number(),
	// A PERCENTAGE, 0–100. `blocked-share` is a fraction, so the projection divides.
	ads_percentage_today: v.number(),
	domains_being_blocked: v.number(),
});

export type PiholeV5Wire = v.InferOutput<typeof summarySchema>;

export type GetPiholeV5StatsInput = {
	href: string;
	/**
	 * The API token from Settings → Show API token — a hash, not the web password. Optional
	 * because an instance with no password set answers without one.
	 */
	credential?: string;
	/** The whole read's budget, minted by business. */
	signal: AbortSignal;
};

export function $getPiholeV5Stats({
	href,
	credential,
	signal,
}: GetPiholeV5StatsInput): Promise<Result<PiholeV5Wire>> {
	return useAsyncErrorAsValue(async () => {
		const query = new URLSearchParams({
			summaryRaw: '',
		});

		if (credential) {
			query.set('auth', credential);
		}

		const raw = await fetch(`${href}/admin/api.php?${query}`, {
			signal,
			// The token rides in the QUERY STRING, so a redirect would hand it verbatim to
			// whichever host the response named — one the operator never configured. An href
			// that redirects has to be written out in full instead.
			redirect: 'manual',
		});

		if (!raw.ok) {
			throw new Error(`Pi-hole responded with ${raw.status} ${raw.statusText}`);
		}

		const parsed = v.safeParse(summarySchema, await raw.json());

		// A REJECTED token is a 200 carrying `[]` on this API, not a 401 — so without this
		// check a wrong token renders an empty box with nothing said anywhere.
		if (!parsed.success) {
			throw new Error('answered 200 with a body that is not stats');
		}

		return parsed.output;
	}, `Could not read Pi-hole stats from ${href}`);
}
