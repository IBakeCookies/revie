import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import ping from 'ping';
import { readConfig } from '$lib/server/config';
import { collectServiceHrefs } from '$lib/utils/config';

const PING_TIMEOUT_SECONDS = 2;

function toHostname(href: string): string | undefined {
	try {
		return new URL(href).hostname;
	} catch {
		return undefined;
	}
}

/** Only hosts the dashboard is configured to show may be probed. */
async function configuredHostnames(): Promise<Set<string>> {
	const config = await readConfig();
	const hostnames = new Set<string>();

	for (const page of Object.values(config.pages)) {
		for (const href of collectServiceHrefs(page.containers)) {
			const hostname = toHostname(href);

			if (hostname) {
				hostnames.add(hostname);
			}
		}
	}

	return hostnames;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => undefined);
	const href = typeof body?.href === 'string' ? body.href : undefined;
	const hostname = href ? toHostname(href) : undefined;

	if (!hostname) {
		error(400, 'Expected a body of { href: string } holding an absolute URL');
	}

	if (!(await configuredHostnames()).has(hostname)) {
		error(403, `"${hostname}" is not a configured service`);
	}

	const { alive } = await ping.promise.probe(hostname, {
		timeout: PING_TIMEOUT_SECONDS,
		deadline: PING_TIMEOUT_SECONDS + 1
	});

	return json({ isAlive: alive });
};
