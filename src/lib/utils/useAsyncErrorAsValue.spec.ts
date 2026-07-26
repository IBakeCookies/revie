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

	it('labels a rejection that is not an Error', async () => {
		const [err] = await useAsyncErrorAsValue(async () => {
			throw 'just a string';
		});

		expect(err?.message).toBe('An unknown error occurred');
		expect(err?.cause).toBe('just a string');
	});
});
