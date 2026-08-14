import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '$env/dynamic/private';
import {
	isAdminAuthenticated,
	isAdminEnabled,
	signInAdmin,
	signOutAdmin,
} from '$lib/business/model/admin-auth';

vi.mock('$env/dynamic/private', () => ({
	env: {},
}));

vi.mock('$app/environment', () => ({
	dev: true,
}));

const TOKEN = 'correct-horse-battery-staple';

const cookies = () => ({
	get: vi.fn(),
	set: vi.fn(),
	delete: vi.fn(),
});

const holding = (value: string | undefined) => ({
	get: () => value,
});

beforeEach(() => {
	env.DASHBOARD_ADMIN_TOKEN = TOKEN;
});

describe('isAdminEnabled', () => {
	it('is off until a token is configured', () => {
		env.DASHBOARD_ADMIN_TOKEN = '';

		expect(isAdminEnabled()).toBe(false);
	});

	it('is on once one is', () => {
		expect(isAdminEnabled()).toBe(true);
	});
});

describe('signInAdmin', () => {
	it('accepts the configured token and writes the session', () => {
		const sink = cookies();

		expect(signInAdmin(sink, TOKEN)).toBe(true);
		expect(sink.set).toHaveBeenCalledWith('adminSession', TOKEN, expect.anything());
	});

	it('rejects a wrong token of the same length without writing anything', () => {
		const sink = cookies();
		const wrong = `${TOKEN.slice(0, -1)}X`;

		expect(signInAdmin(sink, wrong)).toBe(false);
		expect(sink.set).not.toHaveBeenCalled();
	});

	// The comparison runs over SHA-256 digests precisely so this case cannot reach
	// `timingSafeEqual` with two different lengths, which throws.
	it('rejects a token of the wrong length rather than throwing', () => {
		expect(signInAdmin(cookies(), `${TOKEN}-and-more`)).toBe(false);
		expect(signInAdmin(cookies(), 'x')).toBe(false);
	});

	it('rejects an empty token', () => {
		expect(signInAdmin(cookies(), '')).toBe(false);
	});

	it('rejects everything while no token is configured, including an empty one', () => {
		env.DASHBOARD_ADMIN_TOKEN = '';

		expect(signInAdmin(cookies(), '')).toBe(false);
		expect(signInAdmin(cookies(), TOKEN)).toBe(false);
	});
});

describe('isAdminAuthenticated', () => {
	it('accepts a session cookie holding the configured token', () => {
		expect(isAdminAuthenticated(holding(TOKEN))).toBe(true);
	});

	it('rejects a session cookie holding anything else, and no cookie at all', () => {
		expect(isAdminAuthenticated(holding('stale-token'))).toBe(false);
		expect(isAdminAuthenticated(holding(undefined))).toBe(false);
	});

	// Rotating the secret is the whole revocation mechanism, so it has to hold.
	it('rejects a session minted under a token that has since been rotated', () => {
		env.DASHBOARD_ADMIN_TOKEN = 'a-new-token';

		expect(isAdminAuthenticated(holding(TOKEN))).toBe(false);
	});
});

describe('signOutAdmin', () => {
	it('clears the session cookie', () => {
		const sink = cookies();

		signOutAdmin(sink);

		expect(sink.delete).toHaveBeenCalledWith('adminSession', expect.anything());
	});
});
