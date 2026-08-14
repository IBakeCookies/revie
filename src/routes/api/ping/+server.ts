import type { RequestHandler } from './$types';
import net from 'node:net';
import { error, json } from '@sveltejs/kit';
import { readConfig } from '$lib/business/model/config-source';
import { collectServiceHrefs } from '$lib/business/model/config';

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

/** Only endpoints the dashboard is configured to show may be probed. */
async function configuredEndpoints(): Promise<Set<string>> {
	const { config } = await readConfig();
	const keys = new Set<string>();

	for (const page of Object.values(config.pages)) {
		for (const href of collectServiceHrefs(page.containers)) {
			const endpoint = toEndpoint(href);

			if (endpoint) {
				keys.add(endpoint.key);
			}
		}
	}

	return keys;
}

/**
 * A TCP connect to the service's own port, which is what the dot claims to
 * measure. ICMP would answer for the host, so a dead service on a live box
 * stayed green and two boxes on one host could never disagree.
 */
function probe({ host, port }: Endpoint): Promise<boolean> {
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

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => undefined);
	const href = typeof body?.href === 'string' ? body.href : undefined;
	const endpoint = href ? toEndpoint(href) : undefined;

	if (!endpoint) {
		error(400, 'Expected a body of { href: string } holding an absolute http(s) URL');
	}

	if (!(await configuredEndpoints()).has(endpoint.key)) {
		error(403, `"${endpoint.key}" is not a configured service`);
	}

	return json({
		isAlive: await probe(endpoint),
	});
};
