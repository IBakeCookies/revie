import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastStore } from '$lib/business/store/toast-store.svelte';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('ToastStore', () => {
	it('starts with nothing to show', () => {
		expect(new ToastStore().messages).toEqual([]);
	});

	it('shows the string it was given, verbatim', () => {
		const store = new ToastStore();

		// Already resolved by the caller: presentation holds the locale, so nothing
		// below it hands a message in. That is what makes this store translation-blind.
		store.show('AdGuard-Statistiken konnten nicht gelesen werden');

		expect(store.messages).toEqual(['AdGuard-Statistiken konnten nicht gelesen werden']);
	});

	it('does not stack the same failure twice', () => {
		const store = new ToastStore();

		// What a 15-minute poll against a service that stays down does all afternoon.
		store.show('Could not check http://wled.local');
		store.show('Could not check http://wled.local');

		expect(store.messages).toHaveLength(1);
	});

	it('keeps two different failures apart', () => {
		const store = new ToastStore();

		store.show('a');
		store.show('b');

		expect(store.messages).toEqual(['a', 'b']);
	});

	it('clears a message on its own, so a stale failure does not sit there', () => {
		const store = new ToastStore();

		store.show('a');
		vi.advanceTimersByTime(6_000);

		expect(store.messages).toEqual([]);
	});

	it('shows the same failure again once it has cleared', () => {
		const store = new ToastStore();

		store.show('a');
		vi.advanceTimersByTime(6_000);
		store.show('a');

		expect(store.messages).toEqual(['a']);
	});

	it('does not let a dismissed message cut the next one short', () => {
		const store = new ToastStore();

		store.show('a');
		vi.advanceTimersByTime(1_000);
		store.dismiss('a');
		store.show('a');
		// The first timer's 6s mark, one second into the second toast's own life.
		vi.advanceTimersByTime(5_000);

		expect(store.messages).toEqual(['a']);
	});

	it('can be dismissed before it clears', () => {
		const store = new ToastStore();

		store.show('a');
		store.dismiss('a');

		expect(store.messages).toEqual([]);
	});

	it('is bound, so `show` survives being passed as a function', () => {
		const store = new ToastStore();
		const show = store.show;

		show('a');

		expect(store.messages).toEqual(['a']);
	});
});
