/**
 * A probe budget for the unauthenticated ping endpoint.
 *
 * `/api/ping` is unauthenticated by design — its allowlist is the design — so the
 * one thing left to bound is frequency: without it any device on the LAN can spend
 * the server's sockets on every configured service, from the dashboard's own
 * address. The shape is `admin-auth.ts`'s backoff map reduced to a flat budget:
 * process-lifetime, keyed on a client address that arrives as a PARAMETER (R1 —
 * the model imports nothing to get it), pruned on write so the map cannot grow
 * without bound.
 *
 * Every attempt counts, not only answered ones: the budget bounds the work the
 * endpoint does, and even the refusal paths cost a body parse and a config read.
 */

/**
 * Probes one address may ask for per window before it has to wait. Sized by
 * measurement, not by the dashboard's own steady state — which is single digits per
 * minute — but by its burst profile: every page load eagerly probes every configured
 * service, so rapid navigation bursts hard, and the e2e suite measured 163 probes in
 * its busiest rolling minute (4 fixture boxes, every test loading a page, all from
 * the one address the browser answers from). A budget that can trip is a flake
 * factory, so this sits well above that ceiling while still capping sustained abuse
 * at a few connects a second.
 */
const BUDGET_PER_WINDOW = 300;
const WINDOW_MS = 60_000;
/** One stamp per attempt inside the current window, oldest first. */
const probes = new Map<string, number[]>();

/** A kind and a number — the words are presentation's, the same seam as the login lockout. */
export type PingLimit = { status: 'allowed' } | { status: 'throttled'; retryAfterSeconds: number };

function isRecent(at: number, now: number): boolean {
	return now - at < WINDOW_MS;
}

export function takePingLimit(clientAddress: string): PingLimit {
	const now = Date.now();

	// Pruned on write, so the map cannot grow without bound as distinct addresses
	// arrive: once an address's newest stamp is outside the window, none of its
	// stamps can still be counting.
	for (const [address, stamps] of probes) {
		if (!isRecent(stamps[stamps.length - 1], now)) {
			probes.delete(address);
		}
	}

	const recent = (probes.get(clientAddress) ?? []).filter((at) => isRecent(at, now));

	if (recent.length >= BUDGET_PER_WINDOW) {
		// The oldest stamp is the first to leave the window, so it names the wait.
		return {
			status: 'throttled',
			retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)),
		};
	}

	recent.push(now);
	probes.set(clientAddress, recent);

	return {
		status: 'allowed',
	};
}
