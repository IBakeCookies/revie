import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * A public status page's heartbeat feed, transcribed from Uptime Kuma's
 * `server/routers/status-page-router.js` and **not exercised against a live instance** —
 * roadmap #33's own instruction, and true of every provider that lands under it.
 *
 * `heartbeatList` maps a monitor id to its last 100 beats, reversed to oldest-first, each
 * one `toPublicJSON()`: `{ status, time, msg, ping }`. Only `status` is declared, because a
 * schema that names a field is a field the projection may read and nothing here reads the
 * rest. `uptimeList` maps `<id>_24` to a FRACTION, which is what `uptime-24h` carries.
 */
const heartbeatSchema = v.object({
	heartbeatList: v.record(
		v.string(),
		v.array(
			v.object({
				status: v.number(),
			}),
		),
	),
	uptimeList: v.record(v.string(), v.number()),
});

export type UptimeKumaWire = v.InferOutput<typeof heartbeatSchema>;

export type GetUptimeKumaStatsInput = {
	/**
	 * The public STATUS PAGE url — `https://kuma.lan/status/home`. Deliberately no separate
	 * slug prop: it is that url's last segment, so a second prop would be a second thing to
	 * get wrong for a value the href already carries.
	 */
	href: string;
	/** The whole read's budget, minted by business. */
	signal: AbortSignal;
};

/**
 * No credential, by design rather than by omission: a status page is public, so this
 * provider is one of the ones the route's "names no variable ⇒ read anonymously" branch
 * exists for. Taking one and ignoring it would advertise an auth mode that does not exist.
 */
export function $getUptimeKumaStats({
	href,
	signal,
}: GetUptimeKumaStatsInput): Promise<Result<UptimeKumaWire>> {
	return useAsyncErrorAsValue(async () => {
		const url = new URL(href);
		const slug = url.pathname.split('/').filter(Boolean).at(-1);

		// A bare origin is the dashboard, not a status page. Said here rather than let
		// through as `/api/status-page/heartbeat/` and answered with Kuma's own 404, which
		// tells an operator nothing about which half of their href is wrong.
		if (!slug) {
			throw new Error('href must be the status page URL, ending in its slug');
		}

		const raw = await fetch(`${url.origin}/api/status-page/heartbeat/${slug}`, {
			signal,
		});

		// fetch only rejects on network errors, so an unknown slug would otherwise surface
		// as an unrelated JSON parse error.
		if (!raw.ok) {
			throw new Error(`Uptime Kuma responded with ${raw.status} ${raw.statusText}`);
		}

		const parsed = v.safeParse(heartbeatSchema, await raw.json());

		if (!parsed.success) {
			throw new Error('answered 200 with a body that is not stats');
		}

		return parsed.output;
	}, `Could not read Uptime Kuma stats from ${href}`);
}
