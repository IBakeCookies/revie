import { beforeEach, describe, expect, it, vi } from 'vitest';
import ping from 'ping';
import { readConfig } from '$lib/business/config-source';
import { POST } from './+server';

vi.mock('ping', () => ({ default: { promise: { probe: vi.fn() } } }));
vi.mock('$lib/business/config-source', () => ({ readConfig: vi.fn() }));

const probe = vi.mocked(ping.promise.probe);

/** The handler only ever touches the request. */
function event(body: BodyInit): Parameters<typeof POST>[0] {
	return {
		request: new Request('http://localhost/api/ping', { method: 'POST', body })
	} as Parameters<typeof POST>[0];
}

beforeEach(() => {
	vi.mocked(readConfig).mockResolvedValue({
		pages: {
			'/': {
				containers: [
					{
						name: 'BoxService',
						props: {
							title: 'WLED',
							href: 'http://wled.local:80',
							img: { src: '' }
						}
					}
				]
			}
		}
	});

	probe.mockResolvedValue({ alive: true } as Awaited<ReturnType<typeof probe>>);
});

describe('POST /api/ping', () => {
	it('probes the hostname of a configured service', async () => {
		const response = await POST(event(JSON.stringify({ href: 'http://wled.local:80' })));

		expect(await response.json()).toEqual({ isAlive: true });
		expect(probe).toHaveBeenCalledWith('wled.local', expect.objectContaining({ timeout: 2 }));
	});

	it('reports an unreachable service instead of failing', async () => {
		probe.mockResolvedValue({ alive: false } as Awaited<ReturnType<typeof probe>>);

		const response = await POST(event(JSON.stringify({ href: 'http://wled.local:80' })));

		expect(await response.json()).toEqual({ isAlive: false });
	});

	it('refuses a host that is not in the config, so the endpoint is not a port scanner', async () => {
		await expect(
			POST(event(JSON.stringify({ href: 'http://192.168.178.1' })))
		).rejects.toMatchObject({ status: 403 });
		expect(probe).not.toHaveBeenCalled();
	});

	it('rejects a body without an absolute URL', async () => {
		await expect(POST(event(JSON.stringify({ href: 'wled.local' })))).rejects.toMatchObject({
			status: 400
		});
	});

	it('rejects a body that is not JSON', async () => {
		await expect(POST(event('not json'))).rejects.toMatchObject({ status: 400 });
	});
});
