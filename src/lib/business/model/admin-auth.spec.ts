import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// Every test keys its attempts on its own address, so the module-scope counter needs
// no reset between them — and production needs no test-only reset export.
describe('signInAdmin', () => {
	it('accepts the configured token and writes the session', () => {
		const sink = cookies();

		expect(signInAdmin(sink, TOKEN, '10.0.0.1').status).toBe('signed-in');
		expect(sink.set).toHaveBeenCalledWith('adminSession', TOKEN, expect.anything());
	});

	it('rejects a wrong token of the same length without writing anything', () => {
		const sink = cookies();
		const wrong = `${TOKEN.slice(0, -1)}X`;

		expect(signInAdmin(sink, wrong, '10.0.0.2').status).toBe('rejected');
		expect(sink.set).not.toHaveBeenCalled();
	});

	// The comparison runs over SHA-256 digests precisely so this case cannot reach
	// `timingSafeEqual` with two different lengths, which throws.
	it('rejects a token of the wrong length rather than throwing', () => {
		expect(signInAdmin(cookies(), `${TOKEN}-and-more`, '10.0.0.3').status).toBe('rejected');
		expect(signInAdmin(cookies(), 'x', '10.0.0.3').status).toBe('rejected');
	});

	it('rejects an empty token', () => {
		expect(signInAdmin(cookies(), '', '10.0.0.4').status).toBe('rejected');
	});

	it('rejects everything while no token is configured, including an empty one', () => {
		env.DASHBOARD_ADMIN_TOKEN = '';

		expect(signInAdmin(cookies(), '', '10.0.0.5').status).toBe('rejected');
		expect(signInAdmin(cookies(), TOKEN, '10.0.0.5').status).toBe('rejected');
	});
});

describe('signInAdmin rate limiting', () => {
	const failOnce = (address: string) => signInAdmin(cookies(), 'not-the-token', address);

	/** Asserts the lock and hands back the wait, so every iteration carries an assertion. */
	const lockedSeconds = (address: string) => {
		const result = failOnce(address);

		expect(result.status).toBe('locked');

		return result.status === 'locked' ? result.retryAfterSeconds : 0;
	};

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('lets an address spend five failures without locking', () => {
		for (let i = 0; i < 5; i += 1) {
			expect(failOnce('10.1.0.1').status).toBe('rejected');
		}
	});

	it('locks on the sixth failure', () => {
		for (let i = 0; i < 5; i += 1) failOnce('10.1.0.2');

		expect(failOnce('10.1.0.2')).toEqual({
			status: 'locked',
			retryAfterSeconds: 5,
		});
	});

	it('doubles the wait on every further failure and caps it at a minute', () => {
		for (let i = 0; i < 5; i += 1) failOnce('10.1.0.3');

		const waits: number[] = [];

		// Waiting the lock out is the only way to spend another attempt: a locked
		// address is refused before it is counted.
		for (let i = 0; i < 6; i += 1) {
			const seconds = lockedSeconds('10.1.0.3');

			waits.push(seconds);
			vi.advanceTimersByTime(seconds * 1000);
		}

		expect(waits).toEqual([5, 10, 20, 40, 60, 60]);
	});

	it('refuses even the correct token while the address is locked', () => {
		const sink = cookies();

		for (let i = 0; i < 6; i += 1) failOnce('10.1.0.4');

		expect(signInAdmin(sink, TOKEN, '10.1.0.4').status).toBe('locked');
		expect(sink.set).not.toHaveBeenCalled();
	});

	it('clears the count on a successful sign-in', () => {
		for (let i = 0; i < 5; i += 1) failOnce('10.1.0.5');

		expect(signInAdmin(cookies(), TOKEN, '10.1.0.5').status).toBe('signed-in');

		for (let i = 0; i < 5; i += 1) {
			expect(failOnce('10.1.0.5').status).toBe('rejected');
		}
	});

	it('lets the address back in once the lock expires', () => {
		for (let i = 0; i < 6; i += 1) failOnce('10.1.0.6');

		vi.advanceTimersByTime(5_000);

		expect(signInAdmin(cookies(), TOKEN, '10.1.0.6').status).toBe('signed-in');
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
