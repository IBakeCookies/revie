import { describe, expect, it } from 'vitest';
import { useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

describe('useAsyncErrorAsValue', () => {
	it('returns the resolved value in the second slot', async () => {
		const [err, res] = await useAsyncErrorAsValue(async () => 42);

		expect(err).toBeNull();
		expect(res).toBe(42);
	});

	it('turns a thrown Error into a value instead of rejecting', async () => {
		const cause = new Error('boom');

		const [err, res] = await useAsyncErrorAsValue(async () => {
			throw cause;
		});

		expect(res).toBeNull();
		expect(err?.cause).toBe(cause);
	});

	it("carries a thrown Error's own message, so a failure is always reportable", async () => {
		const [err] = await useAsyncErrorAsValue(async () => {
			throw new Error('AdGuard responded with 401 Unauthorized');
		});

		expect(err?.message).toBe('AdGuard responded with 401 Unauthorized');
	});

	it('falls back to the given message when the thrown value has none', async () => {
		const [err] = await useAsyncErrorAsValue(async () => {
			throw 'just a string';
		}, 'Could not reach the service');

		expect(err?.message).toBe('Could not reach the service');
		expect(err?.cause).toBe('just a string');
	});

	it('always produces a message, even with no fallback given', async () => {
		const [err] = await useAsyncErrorAsValue(async () => {
			throw new Error('');
		});

		expect(err?.message).toBe('An unknown error occurred');
	});
});
