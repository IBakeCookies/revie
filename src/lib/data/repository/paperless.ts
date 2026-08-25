import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * `/api/statistics/`, transcribed from Paperless-ngx's REST API (the same shape its own
 * statistics dashboard widget reads) and **not exercised against a live instance** —
 * roadmap #33's own instruction, and true of every provider that lands under it.
 *
 * Only what the projection reads is declared. Valibot's output drops what nobody
 * declared, so the per-mime-type breakdown, the character count and `current_asn`
 * cannot reach a projection that validated nothing about them. The trailing slash is
 * part of the path: Django redirects the bare form at it, and a redirect is a second
 * round trip inside this read's one budget for nothing.
 */
const statisticsSchema = v.object({
	documents_total: v.number(),
	documents_inbox: v.number(),
});

export type PaperlessWire = v.InferOutput<typeof statisticsSchema>;

export type GetPaperlessStatsInput = {
	/** Base URL of the instance — `https://paperless.lan:8000`. The path is appended. */
	href: string;
	/**
	 * An API token, from My Profile → Auth Tokens in the web UI. A username and password
	 * is deliberately not accepted: those buy a login round trip and a token that can
	 * expire mid-read, where a token is revocable and static — the Proxmox reasoning.
	 */
	credential?: string;
	/** The whole read's budget, minted by business. */
	signal: AbortSignal;
};

export function $getPaperlessStats({
	href,
	credential,
	signal,
}: GetPaperlessStatsInput): Promise<Result<PaperlessWire>> {
	return useAsyncErrorAsValue(async () => {
		const raw = await fetch(`${href}/api/statistics/`, {
			headers: credential
				? {
						Authorization: `Token ${credential}`,
					}
				: {},
			signal,
			// No redirect refusal, unlike the Pi-holes: the credential rides in
			// `Authorization`, which fetch deletes when a redirect crosses an origin, so a
			// followed one reaches its target unauthenticated — the measured AdGuard case,
			// with nothing left to leak.
		});

		// fetch only rejects on network errors, so an auth failure would otherwise
		// surface as an unrelated JSON parse error.
		if (!raw.ok) {
			throw new Error(`Paperless-ngx responded with ${raw.status} ${raw.statusText}`);
		}

		const parsed = v.safeParse(statisticsSchema, await raw.json());

		if (!parsed.success) {
			throw new Error('answered 200 with a body that is not stats');
		}

		return parsed.output;
	}, `Could not read Paperless-ngx stats from ${href}`);
}
