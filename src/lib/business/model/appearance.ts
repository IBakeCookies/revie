/**
 * Business-layer surface for the SSR appearance handoff, so route/hook code
 * reaches the appearance cookies through here (layer rule: presentation →
 * business → data).
 *
 * It also owns the two decisions the raw cookies can't make: whether a stored
 * theme still exists (cookies outlive deploys) and whether a scenery seed has
 * to be minted. Both used to be inlined in `+layout.server.ts` and
 * `hooks.server.ts` with their own copies of the logic.
 */

import * as appearanceRepository from '$lib/data/repository/appearance-repository';
import type { CookieSource } from '$lib/data/storage/cookie';
import {
	DEFAULT_THEME,
	getClassesToAdd,
	randomScenerySeed,
	resolveThemeName,
	type ThemeName,
} from '$lib/business/model/theme';

export interface RequestAppearance {
	/** Undefined when nothing valid is stored — the client picks a default. */
	theme: ThemeName | undefined;
	/** Classes to stamp into the HTML pre-paint; falls back to the default. */
	themeClass: string;
	/** Undefined means "no preference" — the client uses prefers-reduced-motion. */
	sceneryPaused: boolean | undefined;
}

/** Read-only: what this request should render as. */
export function readRequestAppearance(cookies: CookieSource): RequestAppearance {
	const stored = appearanceRepository.$readAppearance(cookies);
	const theme = resolveThemeName(stored.theme);

	return {
		theme,
		themeClass: getClassesToAdd(theme ?? DEFAULT_THEME).join(' '),
		sceneryPaused: stored.sceneryPaused,
	};
}

/**
 * The theme the browser's own cookie names, resolved against the catalogue.
 *
 * Browser-only. Returns undefined when nothing valid is stored, so the caller
 * falls back to its defaults rather than rendering unstyled.
 */
export function readClientTheme(): ThemeName | undefined {
	return resolveThemeName(appearanceRepository.$readAppearance().theme);
}

/*
 * Writes. Thin over the repository on purpose, but not pass-throughs: they
 * narrow to `ThemeName`, so presentation cannot persist a theme that is not in
 * the catalogue. The repository takes a bare string because it also has to
 * parse whatever an old cookie happens to hold.
 */

export function updateTheme(theme: ThemeName): void {
	appearanceRepository.$updateTheme(theme);
}

export function updateScenerySeed(seed: number): void {
	appearanceRepository.$updateScenerySeed(seed);
}

export function updateSceneryMotion(paused: boolean): void {
	appearanceRepository.$updateSceneryMotion(paused);
}

/**
 * The per-user scenery seed, minted and persisted on first visit so the
 * animated themes vary per visitor. Called once per request, in the root
 * layout load — the server is the only place that can mint it before the
 * SSR'd style attribute is written, and a second mint would shift the scenery
 * between server and client.
 */
export function readOrMintScenerySeed(
	cookies: CookieSource & Parameters<typeof appearanceRepository.$createScenerySeedCookie>[0],
): number {
	const stored = appearanceRepository.$readAppearance(cookies).scenerySeed;

	if (stored !== undefined) return stored;

	const seed = randomScenerySeed();
	appearanceRepository.$createScenerySeedCookie(cookies, seed);

	return seed;
}
