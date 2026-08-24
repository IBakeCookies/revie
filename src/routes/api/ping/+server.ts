import type { RequestHandler } from './$types';
import net from 'node:net';
import { error, json } from '@sveltejs/kit';
import { readConfig } from '$lib/business/model/config-source';
import { type ServiceProbe, collectServiceProbes } from '$lib/business/model/config';
import { takePingLimit } from '$lib/business/model/ping-limit';

const PROBE_TIMEOUT_MS = 2000;

const DEFAULT_PORTS: Record<string, number> = {
	'http:': 80,
	'https:': 443,
};

interface Endpoint {
	host: string;
	port: number;
	/** Identity of a service for the allowlist: two boxes on one host differ by port. */
	key: string;
}

function toEndpoint(href: string): Endpoint | undefined {
	let url: URL;

	try {
		url = new URL(href);
	} catch {
		return undefined;
	}

	const port = Number(url.port) || DEFAULT_PORTS[url.protocol];

	if (!port) {
		return undefined;
	}

	// URL keeps the brackets on an IPv6 literal; net.connect wants the bare address
	const host = url.hostname.replace(/^\[|\]$/g, '');

	return {
		host,
		port,
		key: `${host}:${port}`,
	};
}

interface Target {
	endpoint: Endpoint;
	/**
	 * The href from the CONFIG, never the request's. An http probe asks for a path, and
	 * the path a caller may ask about is the one the operator wrote down.
	 */
	href: string;
	probe: ServiceProbe['probe'];
}

/**
 * Only endpoints the dashboard is configured to show may be probed, and only the way it
 * says to probe them.
 *
 * The mode is resolved HERE, from the file. It is deliberately not accepted from the
 * request: this endpoint is unauthenticated, so a client-supplied mode would let anyone
 * on the LAN decide the server should issue HTTP requests rather than open a socket.
 * What a caller may do is ask about a configured endpoint; which probe that means is
 * already the operator's decision.
 */
async function configuredTargets(): Promise<Map<string, Target>> {
	const { config } = await readConfig();
	const targets = new Map<string, Target>();

	for (const page of Object.values(config.pages)) {
		for (const { href, probe } of collectServiceProbes(page.containers)) {
			const endpoint = toEndpoint(href);

			if (endpoint) {
				targets.set(endpoint.key, {
					endpoint,
					href,
					probe,
				});
			}
		}
	}

	return targets;
}

/**
 * A TCP connect to the service's own port, which is what the dot claims to
 * measure. ICMP would answer for the host, so a dead service on a live box
 * stayed green and two boxes on one host could never disagree.
 */
function probeTcp({ host, port }: Endpoint): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = net.connect({
			host,
			port,
		});

		const settle = (isAlive: boolean) => {
			socket.destroy();
			resolve(isAlive);
		};

		socket.setTimeout(PROBE_TIMEOUT_MS);
		socket.once('connect', () => settle(true));
		socket.once('timeout', () => settle(false));
		// listened for, not ignored: an unhandled socket 'error' is fatal to the process
		socket.once('error', () => settle(false));
	});
}

/**
 * An HTTP request to the configured URL, for a host whose connect is a constant — a page
 * on a shared origin, where the port always answers and the PATH is the question.
 *
 * `status < 400`, so a 404 at that path reads as offline, which is the only reason to
 * choose this mode. A 401 or 403 reads as offline too, which is a real limit rather than
 * an oversight: a service that answers those while being up wants `tcp`.
 *
 * `redirect: 'manual'` is a security choice, not a behaviour one. Following redirects
 * would let an allowlisted host bounce this unauthenticated probe at an address the
 * operator never configured, turning it into a boolean oracle for that address instead.
 * Unfollowed, a 3xx still counts as answering, so an `http:` entry that redirects to
 * `https:` — the common case by far — is online without the hop being taken.
 *
 * `HEAD` because the body is never read. A service answering 405 to it reads as offline,
 * which is the third reason this is opt-in per box and `tcp` stays the default.
 *
 * A throw is the answer rather than an error to hand back: a refused connection, a DNS
 * failure and a rejected self-signed certificate all mean "not answering" here, the same
 * way the socket's own 'error' settles false above.
 */
async function probeHttp(href: string): Promise<boolean> {
	try {
		const res = await fetch(href, {
			method: 'HEAD',
			redirect: 'manual',
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		});

		return res.status < 400;
	} catch {
		return false;
	}
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	// Before anything the caller could make us compute — a throttled address costs
	// no body parse and no config read. The words are this route's; the model only
	// answers with a kind and a number.
	const limit = takePingLimit(getClientAddress());

	if (limit.status === 'throttled') {
		error(429, `Too many probes, retry in ${limit.retryAfterSeconds} seconds`);
	}

	const body = await request.json().catch(() => undefined);
	const href = typeof body?.href === 'string' ? body.href : undefined;
	const endpoint = href ? toEndpoint(href) : undefined;

	if (!endpoint) {
		error(400, 'Expected a body of { href: string } holding an absolute http(s) URL');
	}

	// A `probe: 'none'` box is absent from this map, so a bookmark's host answers 403 the
	// same way an unconfigured one does — the allowlist never learns it.
	const target = (await configuredTargets()).get(endpoint.key);

	if (!target) {
		error(403, `"${endpoint.key}" is not a configured service`);
	}

	return json({
		isAlive:
			target.probe === 'http' ? await probeHttp(target.href) : await probeTcp(target.endpoint),
	});
};
