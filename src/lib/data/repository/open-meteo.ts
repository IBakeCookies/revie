import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * The forecast endpoint's CURRENT block, transcribed from Open-Meteo's API docs and
 * **not exercised against a live instance** — roadmap #33's own instruction, and true of
 * every provider that lands under it.
 *
 * Only what the projection reads is declared. Valibot's output drops what nobody
 * declared, so the rest of the current block (`weather_code`, `is_day`, …), the
 * `current_units` map and everything around it (latitude, elevation) cannot reach a
 * projection that validated nothing about them.
 */
const openMeteoSchema = v.object({
	current: v.object({
		temperature_2m: v.number(),
		apparent_temperature: v.number(),
		relative_humidity_2m: v.number(),
		precipitation: v.number(),
		wind_speed_10m: v.number(),
	}),
});

export type OpenMeteoWire = v.InferOutput<typeof openMeteoSchema>;

export type GetOpenMeteoStatsInput = {
	/**
	 * The WHOLE request — `https://api.open-meteo.com/v1/forecast` plus its query:
	 * coordinates, the `current=` reading list, the unit system. Nothing is appended to
	 * it and nothing is converted afterwards, so the units a box renders are the ones
	 * this query asked for.
	 */
	href: string;
	/** The whole read's budget, minted by business. */
	signal: AbortSignal;
};

/**
 * No credential, by design rather than by omission: the public API takes none, and a
 * self-hosted mirror answers the same shape at any URL — which is why the href is not
 * pinned to `api.open-meteo.com` here.
 */
export function $getOpenMeteoStats({
	href,
	signal,
}: GetOpenMeteoStatsInput): Promise<Result<OpenMeteoWire>> {
	return useAsyncErrorAsValue(async () => {
		const url = new URL(href);

		// A bare endpoint is the most likely half-paste, and Open-Meteo's own answer to it
		// (a 400 about latitude) says nothing about which half of the href is wrong. Said
		// HERE rather than let through.
		if (!url.searchParams.has('current')) {
			throw new Error('href must carry the query: coordinates and current=…');
		}

		// Fetched VERBATIM — no path appended, no query rewritten — because for this
		// provider the query IS the configuration, the same way BoxSearch's action is
		// config's href whole.
		const raw = await fetch(href, {
			signal,
		});

		// fetch only rejects on network errors, so a bad parameter would otherwise
		// surface as an unrelated JSON parse error.
		if (!raw.ok) {
			throw new Error(`Open-Meteo responded with ${raw.status} ${raw.statusText}`);
		}

		const parsed = v.safeParse(openMeteoSchema, await raw.json());

		if (!parsed.success) {
			throw new Error('answered 200 with a body that is not stats');
		}

		return parsed.output;
	}, `Could not read Open-Meteo stats from ${href}`);
}
