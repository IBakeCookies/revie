import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import BoxDate from '$lib/components/box-date.svelte';
import { spanOf } from '$lib/test/dom';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2024-05-01T10:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('box-date.svelte', () => {
	it('shows the current time down to the second', () => {
		const screen = render(BoxDate);

		expect(screen.container.textContent).toMatch(/\d{1,2}:\d{2}:\d{2}/);
	});

	it('keeps the clock ticking', () => {
		const screen = render(BoxDate);

		// The interval is registered by an $effect, which has to run first.
		flushSync();

		const before = screen.container.textContent;

		vi.setSystemTime(new Date('2024-05-01T10:00:05Z'));
		vi.advanceTimersByTime(1000);
		flushSync();

		expect(screen.container.textContent).not.toBe(before);
	});

	it('stops the interval when it is unmounted', () => {
		const screen = render(BoxDate);

		flushSync();
		screen.unmount();

		expect(vi.getTimerCount()).toBe(0);
	});

	it('passes the column span as a custom property', () => {
		const screen = render(BoxDate, { span: 3 });

		expect(spanOf(screen.container)).toBe('3');
	});
});
