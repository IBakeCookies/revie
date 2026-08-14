/**
 * CRUD access to the admin session cookie.
 *
 * The cookie NAME and its write attributes live here and nowhere else. Whether
 * the value it carries is the operator's token is a decision, and decisions
 * belong to `business/model/admin-auth.ts` — this layer only stores and hands
 * back a string.
 *
 * Server-side only, because the cookie is `httpOnly`: the browser cannot read
 * it and cannot write it, so there is no `document.cookie` half here the way
 * there is for the appearance cookies.
 */

import { dev } from '$app/environment';
import type { CookieSource } from '$lib/data/storage/cookie';

const ADMIN_SESSION_COOKIE = 'adminSession';

/**
 * Deliberately NOT `COOKIE_WRITE_OPTIONS`: the appearance cookies are read by
 * the browser and ride along on cross-site navigations, and this one must do
 * neither. No `maxAge` either — the session lasts the browser session, which is
 * the shortest lifetime that still works without a session store.
 *
 * `secure` follows the build: a dev server is plain http, so an unconditional
 * flag would have the browser drop the cookie and the login never stick. A
 * production deployment therefore has to be behind TLS.
 */
const ADMIN_SESSION_WRITE_OPTIONS = {
	path: '/',
	httpOnly: true,
	sameSite: 'strict',
	secure: !dev,
} as const;

/** SvelteKit's `event.cookies`, typed structurally like `CookieSource`. */
export interface AdminSessionSink {
	set(name: string, value: string, options: typeof ADMIN_SESSION_WRITE_OPTIONS): void;
	delete(name: string, options: { path: string }): void;
}

export function $readAdminSession(source: CookieSource): string | undefined {
	return source.get(ADMIN_SESSION_COOKIE);
}

export function $createAdminSessionCookie(sink: AdminSessionSink, value: string): void {
	sink.set(ADMIN_SESSION_COOKIE, value, ADMIN_SESSION_WRITE_OPTIONS);
}

export function $deleteAdminSessionCookie(sink: AdminSessionSink): void {
	sink.delete(ADMIN_SESSION_COOKIE, {
		path: ADMIN_SESSION_WRITE_OPTIONS.path,
	});
}
