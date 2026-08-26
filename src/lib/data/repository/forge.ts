import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * `/api/v1/notifications`, transcribed from Gitea's published API docs and **not
 * exercised against a live instance** — roadmap #33's own instruction, and true of
 * every provider that lands under it. Forgejo is the same endpoint, header for
 * header: it is a Gitea fork and its v1 API has not diverged here, which is why one
 * reader serves both tokens — three facts differ per product (the name in the error,
 * nothing else) and zero facts in the wire.
 *
 * The unread count rides `X-Total-Count`, NOT the body length: the list is paginated,
 * so an array of 20 threads can be twenty of two hundred unread. The header is what
 * makes the count exact at any volume while the request stays one cheap page.
 *
 * The query pins `status-types=unread` because the default filter is unread PLUS
 * pinned, and a pinned notification is not an unread one. The body itself only has to
 * be an array — no field on a thread is read — so that check exists to turn a login
 * page or an error JSON into an honest failure instead of a number beside it.
 */
const threadsSchema = v.array(v.unknown());

export type ForgeWire = {
	/** Unread notifications, off `X-Total-Count` rather than off the page. */
	total: number;
};

export type GetForgeStatsInput = {
	/** Base URL of the instance — `https://git.lan:3000`. The path is appended. */
	href: string;
	/**
	 * An access token, from Settings → Applications → Access Tokens, with the
	 * `notification` scope read. Without one the read goes anonymous and the instance
	 * answers `401`, which is an ordinary failure.
	 */
	credential?: string;
	/** The whole read's budget, minted by business. */
	signal: AbortSignal;
};

function getForgeNotifications(product: string) {
	return function getNotifications({
		href,
		credential,
		signal,
	}: GetForgeStatsInput): Promise<Result<ForgeWire>> {
		return useAsyncErrorAsValue(async () => {
			const raw = await fetch(`${href}/api/v1/notifications?status-types=unread`, {
				headers: credential
					? {
							Authorization: `token ${credential}`,
						}
					: {},
				signal,
				// No redirect refusal, unlike the Pi-holes: the credential rides in
				// `Authorization`, which fetch deletes when a redirect crosses an origin, so
				// a followed one reaches its target unauthenticated — the measured AdGuard
				// case, with nothing left to leak.
			});

			// fetch only rejects on network errors, so an auth failure would otherwise
			// surface as an unrelated JSON parse error.
			if (!raw.ok) {
				throw new Error(`${product} responded with ${raw.status} ${raw.statusText}`);
			}

			const parsed = v.safeParse(threadsSchema, await raw.json());

			// A MISSING header must not become a zero: `Number(null)` is 0 and
			// `Number.isInteger(0)` is true, so the absent-header case goes through the NaN
			// door rather than being folded into a legitimate empty inbox.
			const total = raw.headers.get('X-Total-Count')?.trim()
				? Number(raw.headers.get('X-Total-Count'))
				: Number.NaN;

			// Two different answers to two different questions, so two checks: a body that
			// is not a list and a total nobody sent both mean "this is not stats", but a
			// proxy that strips headers deserves its own half of the sentence.
			if (!parsed.success || !Number.isInteger(total)) {
				throw new Error('answered 200 with a response that is not stats');
			}

			return {
				total,
			};
		}, `Could not read ${product} stats from ${href}`);
	};
}

export const $getGiteaStats = getForgeNotifications('Gitea');

export const $getForgejoStats = getForgeNotifications('Forgejo');
