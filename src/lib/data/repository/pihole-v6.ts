import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * Pi-hole 6 speaks to FTL's own webserver instead of v5's PHP admin, and renamed AND
 * re-nested every field on the way. Transcribed from FTL's published OpenAPI specs
 * (`src/api/docs/content/specs/`) and **not exercised against a live instance** — roadmap
 * #33's own instruction.
 *
 * `percent_blocked` is 0–100 here as it was in v5; `blocked-share` is a fraction, so the
 * projection divides.
 */
const summarySchema = v.object({
	queries: v.object({
		total: v.number(),
		blocked: v.number(),
		percent_blocked: v.number(),
	}),
	gravity: v.object({
		domains_being_blocked: v.number(),
	}),
});

/** `POST /api/auth`'s answer. `sid` is nullable, and null is a refusal with a 200 on it. */
const sessionSchema = v.object({
	session: v.object({
		sid: v.nullable(v.string()),
	}),
});

export type PiholeV6Wire = v.InferOutput<typeof summarySchema>;

/**
 * One live session id per instance, at module scope, with whether it has ever served a
 * summary.
 *
 * It has to be cached: FTL caps `webserver.api.max_sessions` at 16 and answers 429 once
 * they are gone, so a login per read would take the operator's own admin UI down with it.
 * What invalidates an entry is named and bounded — a 401 from the summary call, which is
 * what FTL's 30-minute session timeout produces — so this is not an unbounded cache with a
 * hopeful expiry. Bounded by `config.json` like the stats cache above it, so not pruned.
 *
 * `proven` is what keeps that bound honest. A 401 is only EVIDENCE of expiry for a session
 * that had worked; a proxy stripping `X-FTL-SID`, TOTP on the instance, or an app password
 * without the scope answers 401 to a session minted seconds earlier, and never stops. Those
 * spent a seat per read — 16 gone in eight minutes at the 30s stats window, and the
 * operator locked out of their own admin UI by the 429 this cache exists to prevent.
 */
const sessions = new Map<string, { sid: string; proven: boolean }>();

export type GetPiholeV6StatsInput = {
	href: string;
	/** The web password, or an application password. */
	credential?: string;
	/**
	 * The whole read's budget, minted by business and spent across BOTH round trips. A
	 * bound of this repository's own would have been paid twice — the login and the read.
	 */
	signal: AbortSignal;
};

function readSummary(
	href: string,
	sid: string | undefined,
	signal: AbortSignal,
): Promise<Response> {
	return fetch(`${href}/api/stats/summary`, {
		// No session id at all for an instance with no password set — sending an empty
		// header is not the same request as sending none.
		headers: sid
			? {
					'X-FTL-SID': sid,
				}
			: {},
		signal,
		// The session id is on the wire, so a redirect would hand it to a host the operator
		// never configured.
		redirect: 'manual',
	});
}

async function parseSummary(raw: Response): Promise<PiholeV6Wire> {
	if (!raw.ok) {
		throw new Error(`Pi-hole responded with ${raw.status} ${raw.statusText}`);
	}

	const parsed = v.safeParse(summarySchema, await raw.json());

	if (!parsed.success) {
		throw new Error('answered 200 with a body that is not stats');
	}

	return parsed.output;
}

async function authenticate(
	href: string,
	credential: string | undefined,
	signal: AbortSignal,
): Promise<string> {
	const raw = await fetch(`${href}/api/auth`, {
		method: 'POST',
		headers: {
			'Content-type': 'application/json',
		},
		body: JSON.stringify({
			password: credential,
		}),
		signal,
		redirect: 'manual',
	});

	// 429 is the one worth recognising by number rather than by wording: it means the seats
	// are gone, and the status in the log is what tells an operator to look at their own
	// open sessions rather than at their password.
	if (!raw.ok) {
		throw new Error(`Pi-hole refused the login with ${raw.status} ${raw.statusText}`);
	}

	const parsed = v.safeParse(sessionSchema, await raw.json());

	if (!parsed.success || !parsed.output.session.sid) {
		throw new Error('accepted the login without returning a session id');
	}

	// Unproven: FTL issued it, but nothing has read a summary with it yet.
	sessions.set(href, {
		sid: parsed.output.session.sid,
		proven: false,
	});

	return parsed.output.session.sid;
}

export function $getPiholeV6Stats({
	href,
	credential,
	signal,
}: GetPiholeV6StatsInput): Promise<Result<PiholeV6Wire>> {
	return useAsyncErrorAsValue(async () => {
		// A Pi-hole with no password set answers the summary unauthenticated, and its
		// `/api/auth` returns a 200 whose `sid` is null — byte-identical to a refusal, so
		// logging in first fails forever against an instance that is answering. v5 has the
		// same branch for the same instance.
		if (!credential) {
			return parseSummary(await readSummary(href, undefined, signal));
		}

		const cached = sessions.get(href);

		if (cached) {
			const raw = await readSummary(href, cached.sid, signal);

			// Re-authed exactly ONCE, only on a 401, and only for a session that had WORKED.
			// A session outlives the 30s stats window but not FTL's 30-minute timeout, so an
			// expired id is the ordinary case rather than a failure — while any other status
			// is the summary's own answer and stands, and a 401 against a session that never
			// served anything is about the credential, not the session. See `sessions`.
			if (raw.status !== 401 || !cached.proven) {
				const summary = await parseSummary(raw);

				cached.proven = true;

				return summary;
			}

			sessions.delete(href);
		}

		const sid = await authenticate(href, credential, signal);
		const summary = await parseSummary(await readSummary(href, sid, signal));

		sessions.set(href, {
			sid,
			proven: true,
		});

		return summary;
	}, `Could not read Pi-hole stats from ${href}`);
}
