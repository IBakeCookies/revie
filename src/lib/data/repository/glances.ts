import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * `/api/4/cpu` and `/api/4/mem`, transcribed from Glances' RESTful API docs and **not
 * exercised against a live instance** — roadmap #33's own instruction, and true of
 * every provider that lands under it.
 *
 * Two round trips for one read, which is exactly why the 3s bound is minted in
 * `business/model/stats.ts` and handed down as ONE signal: a per-fetch bound here
 * would be spent twice, quietly doubling the worst case the page rests on. Both
 * fetches share that signal, so cancelling the read cancels both halves of it.
 */
const cpuSchema = v.object({
	/** Sum of all CPU percentages except idle — already "how busy", nothing to invert. */
	total: v.number(),
});

const memSchema = v.object({
	/** `(total - available) / total * 100` — Glances' own cross-platform usage number. */
	percent: v.number(),
});

export type GlancesWire = {
	cpu: v.InferOutput<typeof cpuSchema>;
	mem: v.InferOutput<typeof memSchema>;
};

export type GetGlancesStatsInput = {
	/** Base URL of the server — `http://nas.lan:61208`. Both plugin paths are appended. */
	href: string;
	/**
	 * A `user:password` pair, only if the server was started with its auth mode on —
	 * by default the API answers anyone who can reach it, so leave `secret` out.
	 */
	credential?: string;
	/** The whole read's budget, minted by business — spent ONCE across both fetches. */
	signal: AbortSignal;
};

async function getPlugin(
	href: string,
	path: string,
	headers: Record<string, string>,
	signal: AbortSignal,
): Promise<unknown> {
	const raw = await fetch(`${href}/api/4/${path}`, {
		headers,
		signal,
	});

	// fetch only rejects on network errors, so an auth failure would otherwise
	// surface as an unrelated JSON parse error.
	if (!raw.ok) {
		throw new Error(`Glances responded with ${raw.status} ${raw.statusText} at /api/4/${path}`);
	}

	return raw.json();
}

export function $getGlancesStats({
	href,
	credential,
	signal,
}: GetGlancesStatsInput): Promise<Result<GlancesWire>> {
	return useAsyncErrorAsValue(async () => {
		// No header at all without a credential — sending an empty Basic is not the same
		// request as sending none.
		const headers: Record<string, string> = credential
			? {
					Authorization: `Basic ${btoa(credential)}`,
				}
			: {};

		const [cpu, mem] = await Promise.all([
			getPlugin(href, 'cpu', headers, signal),
			getPlugin(href, 'mem', headers, signal),
		]);

		const parsedCpu = v.safeParse(cpuSchema, cpu);
		const parsedMem = v.safeParse(memSchema, mem);

		if (!parsedCpu.success || !parsedMem.success) {
			throw new Error('answered 200 with a body that is not stats');
		}

		return {
			cpu: parsedCpu.output,
			mem: parsedMem.output,
		};
	}, `Could not read Glances stats from ${href}`);
}
