import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
import http from 'node:http';
import type { ConfigContainer, ProbeMode } from '$lib/business/model/config';
import { readConfig } from '$lib/business/model/config-source';
import { POST } from './+server';

vi.mock('$lib/business/model/config-source', () => ({
	readConfig: vi.fn(),
}));

/* A real listener rather than a mocked socket: what the endpoint has to get right
   is the port, and only an actual connect can tell an open one from a closed one.
   Port 1 is privileged, so nothing is listening on it and the connect is refused. */
const CLOSED_PORT = 1;
const server = net.createServer();
let openPort = 0;

/* The `http` mode needs a server that actually speaks HTTP: the socket above accepts a
   connection and then says nothing, which is precisely the case that mode exists to tell
   apart. One origin serving three answers, because the allowlist is keyed on host:port —
   so the PATH is the only thing left to vary. */
const httpServer = http.createServer((req, res) => {
	if (req.url === '/up') {
		res.writeHead(200).end();

		return;
	}

	if (req.url === '/moved') {
		res
			.writeHead(302, {
				location: '/up',
			})
			.end();

		return;
	}

	res.writeHead(404).end();
});

let httpPort = 0;

/** The handler only ever touches the request. */
function event(body: BodyInit): Parameters<typeof POST>[0] {
	return {
		request: new Request('http://localhost/api/ping', {
			method: 'POST',
			body,
		}),
	} as Parameters<typeof POST>[0];
}

function service(title: string, href: string, probe?: ProbeMode): ConfigContainer {
	return {
		name: 'BoxService',
		props: {
			title,
			href,
			img: {
				src: '',
			},
			probe,
		},
	};
}

/** What the file says, which is the only thing the endpoint may take a mode from. */
function configuredWith(...containers: ConfigContainer[]): void {
	vi.mocked(readConfig).mockResolvedValue({
		config: {
			pages: {
				'/': {
					containers,
				},
			},
		},
		warnings: [],
		error: null,
		mtimeMs: 1,
		isFresh: false,
	});
}

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));

	openPort = (server.address() as net.AddressInfo).port;
	httpPort = (httpServer.address() as net.AddressInfo).port;
});

afterAll(() => {
	server.close();
	httpServer.close();
});

beforeEach(() => {
	configuredWith(
		service('Listening', `http://127.0.0.1:${openPort}`),
		service('Closed', `http://127.0.0.1:${CLOSED_PORT}`),
	);
});

async function isAlive(href: string): Promise<unknown> {
	return (
		await POST(
			event(
				JSON.stringify({
					href,
				}),
			),
		)
	).json();
}

describe('POST /api/ping', () => {
	it('reports a service that accepts a connection on its own port as online', async () => {
		await expect(isAlive(`http://127.0.0.1:${openPort}`)).resolves.toEqual({
			isAlive: true,
		});
	});

	it('reports a live host with a dead port as offline, not as up', async () => {
		await expect(isAlive(`http://127.0.0.1:${CLOSED_PORT}`)).resolves.toEqual({
			isAlive: false,
		});
	});

	it('refuses a host that is not in the config, so the endpoint is not a port scanner', async () => {
		await expect(
			POST(
				event(
					JSON.stringify({
						href: 'http://192.168.178.1',
					}),
				),
			),
		).rejects.toMatchObject({
			status: 403,
		});
	});

	it('refuses a configured host on a port no container names', async () => {
		await expect(
			POST(
				event(
					JSON.stringify({
						href: 'http://127.0.0.1:9999',
					}),
				),
			),
		).rejects.toMatchObject({
			status: 403,
		});
	});

	it('rejects a body without an absolute URL', async () => {
		await expect(
			POST(
				event(
					JSON.stringify({
						href: 'wled.local',
					}),
				),
			),
		).rejects.toMatchObject({
			status: 400,
		});
	});

	it('rejects a scheme with no port to connect to', async () => {
		await expect(
			POST(
				event(
					JSON.stringify({
						href: 'mailto:someone@example.com',
					}),
				),
			),
		).rejects.toMatchObject({
			status: 400,
		});
	});

	it('rejects a body that is not JSON', async () => {
		await expect(POST(event('not json'))).rejects.toMatchObject({
			status: 400,
		});
	});

	/**
	 * The reason a bookmark is a mode rather than a flag a caller could pass: it is absent
	 * from the allowlist, so its host answers exactly like one nobody configured. Were it
	 * merely undrawn in the UI, `/api/ping` would still connect to it for anyone who asked.
	 */
	it('refuses a probe:none box, so a bookmark never enters the allowlist', async () => {
		configuredWith(service('Bookmark', `http://127.0.0.1:${openPort}`, 'none'));

		await expect(
			POST(
				event(
					JSON.stringify({
						href: `http://127.0.0.1:${openPort}`,
					}),
				),
			),
		).rejects.toMatchObject({
			status: 403,
		});
	});

	it('reports a 200 at the configured path as online in http mode', async () => {
		configuredWith(service('Docs', `http://127.0.0.1:${httpPort}/up`, 'http'));

		await expect(isAlive(`http://127.0.0.1:${httpPort}`)).resolves.toEqual({
			isAlive: true,
		});
	});

	/**
	 * Both halves of the mode at once. The 404 is the point of choosing it — a connect to
	 * this origin succeeds, so tcp would report the page as up whether or not it exists —
	 * and the path probed is the CONFIG's, not the one this request names, which is what
	 * stops an unauthenticated caller from picking the URL the server fetches.
	 */
	it('probes the configured path, so a 404 there is offline even though the port answers', async () => {
		configuredWith(service('Docs', `http://127.0.0.1:${httpPort}/missing`, 'http'));

		await expect(isAlive(`http://127.0.0.1:${httpPort}/up`)).resolves.toEqual({
			isAlive: false,
		});
	});

	/**
	 * `redirect: 'manual'` is what keeps an allowlisted host from bouncing this probe at an
	 * address the operator never configured. Counting a 3xx as answering is what stops that
	 * choice from calling every http→https entry offline.
	 */
	it('counts a redirect as online without following it', async () => {
		configuredWith(service('Docs', `http://127.0.0.1:${httpPort}/moved`, 'http'));

		await expect(isAlive(`http://127.0.0.1:${httpPort}`)).resolves.toEqual({
			isAlive: true,
		});
	});

	it('still opens a socket in tcp mode, where an http probe would have answered', async () => {
		configuredWith(service('Listening', `http://127.0.0.1:${openPort}/up`, 'tcp'));

		await expect(isAlive(`http://127.0.0.1:${openPort}`)).resolves.toEqual({
			isAlive: true,
		});
	});
});
