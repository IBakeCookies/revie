import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// because this was hard to find, I will leave it here
// https://github.com/dcastil/tailwind-merge/blob/v2.2.1/src/lib/default-config.ts

/**
 * The custom spacing scale from style/tokens.css: boxes (padding), grid (gaps
 * between blocks), text (rhythm between lines of content), page.
 *
 * Exported rather than left inline because the two sides must agree and no
 * export can span TS and CSS: either one drifting makes cn() keep both of a
 * conflicting pair with no error anywhere. src/lib/test/invariants.spec.ts is
 * the fence that holds this list against the `--spacing-*` declarations
 * tokens.css actually makes.
 */
export const SPACING_SCALE = [
	'box-3xs',
	'box-2xs',
	'box-xs',
	'box-sm',
	'box-md',
	'box-lg',
	'box-xl',
	'box-2xl',
	'grid-2xs',
	'grid-xs',
	'grid-sm',
	'grid-md',
	'grid-lg',
	'grid-xl',
	'text-3xs',
	'text-2xs',
	'text-xs',
	'text-sm',
	'text-md',
	'text-lg',
	'text-xl',
	'text-2xl',
	'page-sm',
	'page-md',
	'page',
	'section',
	'section-lg',
	'empty-state',
];

const customTwMerge = extendTailwindMerge({
	extend: {
		theme: {
			spacing: SPACING_SCALE,

			// The one `--shadow-*` key tokens.css adds. Unlisted, tailwind-merge reads
			// `shadow-card` as a shadow COLOR instead, so `shadow-none` did not merge it
			// away and sub-grid's switch-off held only by CSS emission order.
			shadow: ['card'],
		},
		conflictingClassGroups: {},
	},
});

export function cn(...inputs: ClassValue[]): string {
	return customTwMerge(clsx(inputs));
}

export const GRID_COLUMNS = 12;

/**
 * Tailwind compiles at build time, so a class name that only appears in runtime
 * config would never exist in the generated CSS. Column width is therefore passed
 * as a custom property and read by the static `xl:col-span-(--span)` utility.
 *
 * The property must always be emitted: an unset `--span` makes `grid-column`
 * invalid at computed-value time, which drops the declaration entirely.
 */
export function spanStyle(span: number = GRID_COLUMNS): string {
	return `--span:${span}`;
}

export function normalizeSpan(span: unknown): number | undefined {
	if (typeof span !== 'number' || !Number.isInteger(span)) {
		return undefined;
	}

	return Math.min(Math.max(span, 1), GRID_COLUMNS);
}
