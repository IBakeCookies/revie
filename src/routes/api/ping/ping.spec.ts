import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
import type { ConfigContainer } from '$lib/business/model/config';
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

/** The handler only ever touches the request. */
function event(body: BodyInit): Parameters<typeof POST>[0] {
	return {
		request: new Request('http://localhost/api/ping', {
			method: 'POST',
			body,
		}),
	} as Parameters<typeof POST>[0];
}

function service(title: string, href: string): ConfigContainer {
	return {
		name: 'BoxService',
		props: {
			title,
			href,
			img: {
				src: '',
			},
		},
	};
}

beforeAll(async () => {
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

	openPort = (server.address() as net.AddressInfo).port;
});

afterAll(() => {
	server.close();
});

beforeEach(() => {
	vi.mocked(readConfig).mockResolvedValue({
		pages: {
			'/': {
				containers: [
					service('Listening', `http://127.0.0.1:${openPort}`),
					service('Closed', `http://127.0.0.1:${CLOSED_PORT}`),
				],
			},
		},
	});
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
});
