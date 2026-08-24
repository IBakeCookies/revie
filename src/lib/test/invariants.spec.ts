import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { themes } from '$lib/business/model/theme';
import { SPACING_SCALE } from '$lib/utils/style';

/**
 * Fences for the hand-mirrored pairs AGENTS.md's Invariants section calls out as
 * breaking silently: no error, just wrong output. Every other spec mocks its
 * fixtures; these read the shipped files, so paths resolve off this spec's own
 * location rather than the process cwd.
 */
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const TOKENS_CSS = readRepoFile('src/lib/presentation/style/tokens.css');
const THEMES_CSS = readRepoFile('src/lib/presentation/style/themes.css');
const BASE_CSS = readRepoFile('src/lib/presentation/style/base.css');

function readRepoFile(pathRelativeToRoot: string): string {
	return readFileSync(join(ROOT, pathRelativeToRoot), 'utf8');
}

/** The paraglide compiler does not fail on a missing translation — it emits a fallback to the base locale. */
function flattenMessageKeys(value: unknown, prefix = ''): string[] {
	if (typeof value !== 'object' || value === null) {
		return [prefix];
	}

	return Object.entries(value).flatMap(([key, child]) =>
		flattenMessageKeys(child, prefix ? `${prefix}.${key}` : key),
	);
}

function classSelectorNames(selector: string): string[] {
	const names: string[] = [];

	for (const segment of selector.split(',')) {
		const match = /\.([a-zA-Z][\w-]*)/.exec(segment);

		if (match?.[1]) {
			names.push(match[1]);
		}
	}

	return names;
}

/** Top-level selectors only — `.glass-dark { .page-shell … }` nests its children, and a child is not a palette. */
function topLevelClassSelectors(css: string): string[] {
	const names: string[] = [];
	let depth = 0;
	let selector = '';

	for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
		if (char === '{') {
			if (depth === 0) {
				names.push(...classSelectorNames(selector));
			}

			selector = '';
			depth += 1;
		} else if (char === '}') {
			depth -= 1;
			selector = '';
		} else if (depth === 0) {
			selector += char;
		}
	}

	return [...new Set(names)];
}

describe('hand-mirrored invariants', () => {
	it('messages/en.json and messages/de.json declare identical keys', () => {
		const en = flattenMessageKeys(JSON.parse(readRepoFile('messages/en.json')));
		const de = flattenMessageKeys(JSON.parse(readRepoFile('messages/de.json')));

		expect(en.length).toBeGreaterThan(0);
		expect([...de].sort()).toEqual([...en].sort());
	});

	it('style.ts mirrors exactly the --spacing-* names tokens.css declares', () => {
		const declared = [...TOKENS_CSS.matchAll(/--spacing-([\w-]+):/g)].map((match) => match[1]);

		expect(new Set(declared)).toEqual(new Set(SPACING_SCALE));
		expect(new Set(SPACING_SCALE).size).toBe(SPACING_SCALE.length);
	});

	it('every theme class has a palette selector in themes.css or base.css', () => {
		const palettes = new Set([
			...topLevelClassSelectors(THEMES_CSS),
			...topLevelClassSelectors(BASE_CSS),
		]);

		for (const theme of themes) {
			for (const className of theme.css) {
				expect(palettes.has(className), `${theme.name}: no palette for .${className}`).toBe(true);
			}
		}
	});

	it('every theme class has an @custom-variant, except solid-light', () => {
		const variants = new Set(
			[...TOKENS_CSS.matchAll(/^@custom-variant\s+([\w-]+)/gm)].map((match) => match[1]),
		);

		for (const theme of themes) {
			for (const className of theme.css) {
				/* solid-light IS the unprefixed :root palette (base.css), so it needs no variant. */
				if (className === 'solid-light') {
					continue;
				}

				expect(variants.has(className), `${theme.name}: no @custom-variant for .${className}`).toBe(
					true,
				);
			}
		}
	});
});
