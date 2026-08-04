import { expect, test } from '@playwright/test';

// The dashboard probes every configured service after mount, and a probe is allowed
// to take a few seconds before it gives up.
const PING = {
	timeout: 20_000,
};

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('marks a reachable service as online', async ({ page }) => {
	const service = page.getByRole('link', {
		name: /Loopback/,
	});

	await expect(service.getByLabel('online')).toBeAttached(PING);
});

test('marks a service that does not resolve as offline', async ({ page }) => {
	const service = page.getByRole('link', {
		name: /Nowhere/,
	});

	await expect(service.getByLabel('offline')).toBeAttached(PING);
});

test('refuses to probe a host that is not in the config', async ({ request }) => {
	const response = await request.post('/api/ping', {
		data: {
			href: 'http://192.168.1.1',
		},
	});

	expect(response.status()).toBe(403);
});

// The allowlist is keyed on host:port, so 127.0.0.1 being configured for the
// preview server's own port does not open every other port on the machine.
test('refuses to probe a configured host on a port no service uses', async ({ request }) => {
	const response = await request.post('/api/ping', {
		data: {
			href: 'http://127.0.0.1:9999',
		},
	});

	expect(response.status()).toBe(403);
});

test('rejects a ping request without an absolute URL', async ({ request }) => {
	const response = await request.post('/api/ping', {
		data: {
			href: 'not a url',
		},
	});

	expect(response.status()).toBe(400);
});
