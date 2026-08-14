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

/** Free guesses before an address is made to wait at all. */
const FREE_ATTEMPTS = 5;
const FIRST_LOCKOUT_MS = 5_000;
const MAX_LOCKOUT_MS = 60_000;

type FailedAttempts = {
	count: number;
	lastAt: number;
};

/**
 * Process-lifetime, keyed on the client address — the same shape as the stamp cache in
 * `config-source.ts`, and for the same reason: a store is unreachable from the SSR path.
 * A restart forgives everyone, which is the operator's own escape hatch.
 */
const failedAttempts = new Map<string, FailedAttempts>();

/** 5s, 10s, 20s, 40s, 60s, 60s… from the first attempt past the budget. */
function lockoutMs(count: number): number {
	return Math.min(FIRST_LOCKOUT_MS * 2 ** (count - FREE_ATTEMPTS - 1), MAX_LOCKOUT_MS);
}

function remainingLockoutMs(attempts: FailedAttempts | undefined, now: number): number {
	if (!attempts || attempts.count <= FREE_ATTEMPTS) return 0;

	return Math.max(attempts.lastAt + lockoutMs(attempts.count) - now, 0);
}

function recordFailure(clientAddress: string, now: number): number {
	// Pruned on write, so the map cannot grow without bound as distinct addresses
	// arrive: nothing older than the longest lockout can still be locking anything.
	// It runs BEFORE the count is read, which makes it the decay too — an address that
	// goes quiet for a minute starts from zero, so the sustained ceiling is 5 guesses
	// per minute rather than 5 ever, and no operator is locked out permanently.
	for (const [address, attempts] of failedAttempts) {
		if (now - attempts.lastAt > MAX_LOCKOUT_MS) failedAttempts.delete(address);
	}

	const attempts = {
		count: (failedAttempts.get(clientAddress)?.count ?? 0) + 1,
		lastAt: now,
	};

	failedAttempts.set(clientAddress, attempts);

	return remainingLockoutMs(attempts, now);
}

/** A kind and a number — the words are presentation's. */
export type AdminSignIn =
	| { status: 'signed-in' }
	| { status: 'rejected' }
	| { status: 'locked'; retryAfterSeconds: number };

/**
 * The session cookie is written only on `'signed-in'`.
 *
 * The client address is a PARAMETER because a model may not reach for the request, and
 * the counter lives here rather than in the hook so that only the one path that actually
 * guesses the secret is counted — `isAdminAuthenticated` runs on every admin request, and
 * counting it would let a spoofed address lock the real operator out.
 */
export function signInAdmin(
	cookies: AdminSessionSink,
	token: string,
	clientAddress: string,
): AdminSignIn {
	const now = Date.now();
	const locked = remainingLockoutMs(failedAttempts.get(clientAddress), now);

	// Before the comparison, so a locked address is refused even when the token is
	// right: otherwise the lockout only ever delays guesses that were going to fail.
	if (locked > 0) {
		return {
			status: 'locked',
			retryAfterSeconds: Math.ceil(locked / 1000),
		};
	}

	if (!matchesAdminToken(token)) {
		const nowLocked = recordFailure(clientAddress, now);

		if (nowLocked === 0) {
			return {
				status: 'rejected',
			};
		}

		return {
			status: 'locked',
			retryAfterSeconds: Math.ceil(nowLocked / 1000),
		};
	}

	failedAttempts.delete(clientAddress);
	adminSessionRepository.$createAdminSessionCookie(cookies, token);

	return {
		status: 'signed-in',
	};
}

export function signOutAdmin(cookies: AdminSessionSink): void {
	adminSessionRepository.$deleteAdminSessionCookie(cookies);
}
