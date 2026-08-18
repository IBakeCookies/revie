import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * A 200 does not mean stats. AdGuard answers `null` on some proxy setups and an error
 * object (`{"message":"unauthorized"}`) on others, and a cast let both through: the
 * first threw a TypeError out of the projection, the second rendered "NaN". The
 * repository owns the wire shape, so the check lives here — inside the error-as-value
 * boundary, where a bad body becomes `[AppError, null]` like any other failure.
 *
 * A schema rather than a hand-rolled predicate, so the type the projection sees is
 * inferred from the thing that validated it and cannot describe a field nothing checked.
 */
const adguardStatsSchema = v.object({
	num_dns_queries: v.number(),
	num_blocked_filtering: v.number(),
	avg_processing_time: v.number(),
	// AdGuard omits this on a fresh install, and Go's `encoding/json` writes a nil slice as
	// `null` — the same "no data yet" instance, one wire value apart. `nullish` and not
	// `optional`: the latter substitutes its default for `undefined` ALONE, so an explicit
	// null ran the array schema and failed the whole read on an instance answering
	// correctly. Defaulted rather than left absent so the projection's `.at(0)` has nothing
	// to optional-chain — the exact call that threw.
	top_blocked_domains: v.nullish(v.array(v.record(v.string(), v.number())), []),
});

export type AdguardWire = v.InferOutput<typeof adguardStatsSchema>;

export type GetAdguardStatsInput = {
	href: string;
	/**
	 * `username:password`, as one opaque string. Every provider gets exactly one, and
	 * what it means is the provider's own business.
	 */
	credential?: string;
	/**
	 * The whole read's budget, minted by business. Not a bound of the repository's own:
	 * a provider that needs two round trips would otherwise spend the bound twice.
	 */
	signal: AbortSignal;
};

export function $getAdguardStats({
	href,
	credential,
	signal,
}: GetAdguardStatsInput): Promise<Result<AdguardWire>> {
	return useAsyncErrorAsValue(async () => {
		// Basic auth is the whole `username:password` string, so nothing is split here —
		// only checked. Missing or half-pasted fails HERE rather than at AdGuard, because
		// a 401 does not tell an operator that they pasted only half of it. Everything
		// after the first colon is the password, so a password may contain colons.
		if (!credential?.includes(':')) {
			throw new Error('credentials must be "username:password"');
		}

		const raw = await fetch(`${href}/control/stats`, {
			headers: {
				Authorization: `Basic ${Buffer.from(credential).toString('base64')}`,
				'Content-type': 'application/json',
			},
			signal,
		});

		// fetch only rejects on network errors, so an auth failure would otherwise
		// surface as an unrelated JSON parse error.
		if (!raw.ok) {
			throw new Error(`AdGuard responded with ${raw.status} ${raw.statusText}`);
		}

		const parsed = v.safeParse(adguardStatsSchema, await raw.json());

		if (!parsed.success) {
			throw new Error('answered 200 with a body that is not stats');
		}

		return parsed.output;
	}, `Could not read AdGuard stats from ${href}`);
}
