/**
 * A reading, as the box renders it. The key is what presentation looks a label up by;
 * business names no message, because it has no locale and no catalogue.
 *
 * Split in two because exactly one reading is a NAME rather than a measurement. That
 * split is what lets presentation format without a cast: `typeof value === 'string'`
 * narrows the union, so the numeric branch indexes a `Record<NumericStatKey, …>` of
 * `Intl` formatters with no dead entry in it.
 *
 * Units are carried by the KEY, never by a field: `avg-latency` IS milliseconds. A
 * second field would restate what the key already says, with nothing forcing the two to
 * agree — which is the whole reason the union is closed.
 *
 * `blocked-share` and `uptime-24h` are FRACTIONS, 0..1, because `Intl`'s percent style is
 * what formats them and it multiplies by 100 itself. Both vendors that emit one report
 * 0–100, so both projections divide — the unit is the key's, not the wire's.
 */
export type NumericStatKey =
	| 'dns-queries'
	| 'blocked'
	| 'avg-latency'
	| 'blocked-share'
	| 'blocklist-domains'
	| 'monitors-up'
	| 'monitors-down'
	| 'uptime-24h';

export type TextStatKey = 'top-blocked-domain';

export type StatKey = NumericStatKey | TextStatKey;

export type NumericStat = {
	key: NumericStatKey;
	value: number;
};

export type TextStat = {
	key: TextStatKey;
	value: string;
};

export type Stat = NumericStat | TextStat;

/**
 * The reading that is a name rather than a measurement, told from the rest at runtime.
 *
 * It lives beside the union because it DISCRIMINATES it: `typeof stat.value === 'string'`
 * does not narrow `Stat` on its own — TypeScript only narrows a union through a property
 * whose type is a literal — so without this, formatting the numeric branch needs a cast
 * and presentation ends up testing `stat.key === 'top-blocked-domain'`, which is a second
 * copy of the split in the layer that must not know the keys apart.
 */
export function isTextStat(stat: Stat): stat is TextStat {
	return typeof stat.value === 'string';
}
