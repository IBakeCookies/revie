/**
 * Operator authentication: one shared secret, no user system.
 *
 * Server-only, like `config-source.ts` — it reads `$env/dynamic/private` and
 * `node:crypto`, so it must never be reachable from a client bundle. Nothing in
 * `presentation` imports it; the hook and the two route server files do.
 *
 * `DASHBOARD_ADMIN_TOKEN` unset means the admin area does not exist. That is a
 * 404 at the guard rather than a 401: a disabled feature must not advertise
 * itself.
 *
 * The session cookie holds the token ITSELF, and that is deliberate. A derived
 * digest would be exactly as replayable — whoever holds the cookie is in either
 * way — so it buys nothing, while `httpOnly` + `sameSite: 'strict'` + `secure`
 * is what actually limits where the value can be read from. It also means
 * rotating `DASHBOARD_ADMIN_TOKEN` invalidates every session at once, with no
 * session store, no session ids, no expiry sweep and no revocation list.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import * as adminSessionRepository from '$lib/data/repository/admin-session-repository';
import type { AdminSessionSink } from '$lib/data/repository/admin-session-repository';
import type { CookieSource } from '$lib/data/storage/cookie';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * Constant-time, over SHA-256 digests rather than the raw strings: a digest is
 * always 32 bytes, so `timingSafeEqual` — which THROWS on a length mismatch —
 * can never be handed one, and a wrong-length guess takes the same path as a
 * wrong-value one instead of returning early.
 */
function matchesAdminToken(candidate: string | undefined): boolean {
	const secret = env.DASHBOARD_ADMIN_TOKEN;

	// Nothing to compare against, and nothing to leak: neither branch depends on
	// the other operand.
	if (!secret || !candidate) return false;

	return timingSafeEqual(sha256(candidate), sha256(secret));
}

/** Unset token ⇒ no admin area at all. */
export function isAdminEnabled(): boolean {
	return Boolean(env.DASHBOARD_ADMIN_TOKEN);
}

export function isAdminAuthenticated(cookies: CookieSource): boolean {
	return matchesAdminToken(adminSessionRepository.$readAdminSession(cookies));
}

/** True when the token was right — and only then is the session cookie written. */
export function signInAdmin(cookies: AdminSessionSink, token: string): boolean {
	if (!matchesAdminToken(token)) return false;

	adminSessionRepository.$createAdminSessionCookie(cookies, token);

	return true;
}

export function signOutAdmin(cookies: AdminSessionSink): void {
	adminSessionRepository.$deleteAdminSessionCookie(cookies);
}
