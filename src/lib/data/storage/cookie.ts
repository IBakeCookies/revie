/**
 * Cookie storage.
 *
 * Cookies hold the handful of preferences the SERVER must know before it can
 * render: the theme class and scenery state are stamped into the HTML by
 * `hooks.server.ts` so the first paint is already correct.
 *
 * The write attributes live here once, as `cookieWriteOptions`; the
 * `document.cookie` string is derived from it, so a `SameSite` or `max-age`
 * change cannot apply to one write path and not the other.
 */

/** One year: a preference should survive a long absence, not a session. */
const MAX_AGE_SECONDS = 31_536_000;

/**
 * The write attributes, as an option object for SvelteKit's `cookies.set`.
 *
 * `secure` is stated rather than left to SvelteKit's default (secure unless the
 * hostname is localhost over http), because that default is wrong in both
 * directions once deployed: on plain http the browser drops the seed cookie and
 * the server re-mints it on every response, so the scenery re-arranges on every
 * navigation; on https the browser-written three would carry no `Secure` at all.
 */
export function cookieWriteOptions(secure: boolean) {
	return {
		path: '/',
		maxAge: MAX_AGE_SECONDS,
		sameSite: 'lax',
		httpOnly: false,
		secure,
	} as const;
}

/**
 * Anything that can hand back a cookie by name — SvelteKit's `event.cookies`.
 * Structural on purpose: the data layer must not depend on the framework.
 */
export interface CookieSource {
	get(name: string): string | undefined;
}

/** Browser-side write. Server-side writes go through SvelteKit's `cookies`. */
export function writeCookie(name: string, value: string): void {
	// `location` is read here and never at module scope: this module is on the SSR
	// import path (appearance-repository → business/model/appearance → hooks.server.ts),
	// where there is no `location` to read.
	const { path, maxAge, sameSite, secure } = cookieWriteOptions(location.protocol === 'https:');
	// `httpOnly` has no counterpart here: a cookie the browser writes itself never is.
	const attributes = `path=${path}; max-age=${maxAge}; SameSite=${sameSite}`;

	document.cookie = `${name}=${encodeURIComponent(value)}; ${attributes}${secure ? '; Secure' : ''}`;
}
