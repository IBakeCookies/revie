import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '$env/dynamic/private';
import { readConfig } from '$lib/business/model/config-source';
import { load } from './+layout.server';

vi.mock('$env/dynamic/private', () => ({
	env: {},
}));

vi.mock('$lib/business/model/config-source', () => ({
	readConfig: vi.fn(),
}));

/** The load only reads the appearance cookies and mints a seed when there is none. */
function event(): Parameters<typeof load>[0] {
	return {
		cookies: {
			get: () => undefined,
			set: () => {},
		},
	} as unknown as Parameters<typeof load>[0];
}

beforeEach(() => {
	vi.mocked(readConfig).mockResolvedValue({
		config: {
			pages: {},
		},
		warnings: [],
		error: null,
		mtimeMs: 1,
		isFresh: false,
	});
});

afterEach(() => {
	// Empty rather than deleted: `isAdminEnabled` is a `Boolean()`, so this is the
	// same "no token" the mocked env starts out with, and the type stays a string.
	env.DASHBOARD_ADMIN_TOKEN = '';
	vi.restoreAllMocks();
});

describe('load', () => {
	// The header link is gated on this flag, and an unset token 404s every /admin
	// path — so a truthy flag there would advertise a feature that is switched off
	// and hand out a link that cannot answer. The e2e suite covers the on case only:
	// one preview server serves every test, with the token set.
	it('reports the admin area as unavailable while no token is set', async () => {
		expect(await load(event())).toMatchObject({
			adminEnabled: false,
		});
	});

	it('reports it as available once the token is set', async () => {
		env.DASHBOARD_ADMIN_TOKEN = 'operator-token';

		expect(await load(event())).toMatchObject({
			adminEnabled: true,
		});
	});
});
