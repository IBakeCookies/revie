/**
 * Cookie storage.
 *
 * Cookies hold the handful of preferences the SERVER must know before it can
 * render: the theme class and scenery state are stamped into the HTML by
 * `hooks.server.ts` so the first paint is already correct.
 *
 * The write attributes live here once, as `COOKIE_WRITE_OPTIONS`; the
 * `document.cookie` string is derived from it, so a `SameSite` or `max-age`
 * change cannot apply to one write path and not the other.
 */

/** One year: a preference should survive a long absence, not a session. */
const MAX_AGE_SECONDS = 31_536_000;

/** The write attributes, as an option object for SvelteKit's `cookies.set`. */
export const COOKIE_WRITE_OPTIONS = {
	path: '/',
	maxAge: MAX_AGE_SECONDS,
	sameSite: 'lax',
	httpOnly: false,
} as const;

// `httpOnly` has no counterpart here: a cookie the browser writes itself never is.
const WRITE_ATTRIBUTES = `path=${COOKIE_WRITE_OPTIONS.path}; max-age=${COOKIE_WRITE_OPTIONS.maxAge}; SameSite=${COOKIE_WRITE_OPTIONS.sameSite}`;

/**
 * Anything that can hand back a cookie by name — SvelteKit's `event.cookies`.
 * Structural on purpose: the data layer must not depend on the framework.
 */
export interface CookieSource {
	get(name: string): string | undefined;
}

/** Browser-side write. Server-side writes go through SvelteKit's `cookies`. */
export function writeCookie(name: string, value: string): void {
	document.cookie = `${name}=${encodeURIComponent(value)}; ${WRITE_ATTRIBUTES}`;
}
