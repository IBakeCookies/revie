import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getOpenMeteoStats } from '$lib/data/repository/open-meteo';

const href =
	'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m';

const input = {
	href,
	// The read's budget is minted by business and handed down, so these cases only need a
	// signal that exists. Short enough that a leaked real fetch dies.
	signal: AbortSignal.timeout(50),
};

/** A live answer, verbatim from the docs' example response — including what the schema must drop. */
const forecast = {
	latitude: 52.52,
	longitude: 13.41,
	generationtime_ms: 0.42,
	utc_offset_seconds: 7200,
	timezone: 'Europe/Berlin',
	current_units: {
		time: 'iso8601',
		interval: 'seconds',
		temperature_2m: '°C',
	},
	current: {
		time: '2026-08-22T12:00',
		interval: 900,
		temperature_2m: 18.7,
		apparent_temperature: 17.2,
		relative_humidity_2m: 63,
		precipitation: 0.2,
		wind_speed_10m: 11.4,
		is_day: 1,
		weather_code: 3,
	},
};

function stubFetch(response: Partial<Response>): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(async () => response as Response);

	vi.stubGlobal('fetch', fetchMock);

	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('$getOpenMeteoStats', () => {
	// The query IS the configuration for this provider — coordinates, reading list and
	// units — so anything appended or rewritten here would second-guess it.
	it('asks for the href VERBATIM, appending no path and rewriting no query', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => forecast,
		});

		const [err] = await $getOpenMeteoStats(input);

		expect(err).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(href, expect.anything());
	});

	it('uses the signal it was given rather than minting one', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => forecast,
		});

		await $getOpenMeteoStats(input);

		expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
	});

	// Only the current block's five readings come back: the schema names those alone, and
	// valibot's output drops what nobody declared — so the projection cannot read a field
	// nothing validated.
	it('answers with the current block alone, dropping everything undeclared', async () => {
		stubFetch({
			ok: true,
			json: async () => forecast,
		});

		const [err, res] = await $getOpenMeteoStats(input);

		expect(err).toBeNull();

		expect(res).toEqual({
			current: {
				temperature_2m: 18.7,
				apparent_temperature: 17.2,
				relative_humidity_2m: 63,
				precipitation: 0.2,
				wind_speed_10m: 11.4,
			},
		});
	});

	// A bare endpoint is the most likely half-paste, and Open-Meteo's own answer to it (a
	// 400 about latitude) says nothing about which half of the href is wrong.
	it('refuses an href without a current= parameter before asking Open-Meteo', async () => {
		const fetchMock = stubFetch({
			ok: true,
			json: async () => forecast,
		});

		const [err, res] = await $getOpenMeteoStats({
			...input,
			href: 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41',
		});

		expect(res).toBeNull();
		expect(err?.message).toContain('href must carry the query');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('names the status in the message the log gets', async () => {
		stubFetch({
			ok: false,
			status: 400,
			statusText: 'Bad Request',
			json: async () => ({}),
		});

		const [err] = await $getOpenMeteoStats(input);

		expect(err?.message).toContain('Open-Meteo responded with 400 Bad Request');
	});

	// The projection runs outside the error-as-value boundary, so a body it cannot read has
	// to fail here — otherwise one malformed 200 is a TypeError that 500s the whole page.
	it('reports a 200 whose body has no current block as an error', async () => {
		stubFetch({
			ok: true,
			json: async () => ({
				error: true,
				reason: 'Initialization failed due to an invalid current variable',
			}),
		});

		const [err, res] = await $getOpenMeteoStats(input);

		expect(res).toBeNull();
		expect(err?.message).toContain('is not stats');
	});

	it('reports a network failure as an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('ECONNREFUSED');
			}),
		);

		const [err] = await $getOpenMeteoStats(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
