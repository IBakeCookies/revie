import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { takePingLimit } from '$lib/business/model/ping-limit';

// Every test keys its attempts on its own address, so the module-scope counter needs
// no reset between them — and production needs no test-only reset export.
describe('takePingLimit', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('allows the whole budget within one window', () => {
		for (let i = 0; i < 300; i += 1) {
			expect(takePingLimit('10.2.0.1').status).toBe('allowed');
		}
	});

	it('throttles the first attempt past the budget, naming the wait', () => {
		for (let i = 0; i < 300; i += 1) takePingLimit('10.2.0.2');

		expect(takePingLimit('10.2.0.2')).toEqual({
			status: 'throttled',
			retryAfterSeconds: 60,
		});
	});

	it('shrinks the wait as the window drains', () => {
		for (let i = 0; i < 300; i += 1) takePingLimit('10.2.0.3');

		vi.advanceTimersByTime(30_000);

		expect(takePingLimit('10.2.0.3')).toEqual({
			status: 'throttled',
			retryAfterSeconds: 30,
		});
	});

	it('frees the address once its stamps have left the window', () => {
		for (let i = 0; i < 300; i += 1) takePingLimit('10.2.0.4');

		vi.advanceTimersByTime(60_000);

		expect(takePingLimit('10.2.0.4').status).toBe('allowed');
	});

	it('counts addresses separately', () => {
		for (let i = 0; i < 300; i += 1) takePingLimit('10.2.0.5');

		expect(takePingLimit('10.2.0.6').status).toBe('allowed');
		expect(takePingLimit('10.2.0.5').status).toBe('throttled');
	});

	// The ceiling is sustained rather than lifetime: a window that drains buys a
	// fresh budget, which is what keeps this from being one long denial of the
	// dashboard's own poll.
	it('spends again after the drain', () => {
		for (let i = 0; i < 300; i += 1) takePingLimit('10.2.0.7');

		vi.advanceTimersByTime(61_000);

		for (let i = 0; i < 300; i += 1) {
			expect(takePingLimit('10.2.0.7').status).toBe('allowed');
		}

		expect(takePingLimit('10.2.0.7').status).toBe('throttled');
	});
});
