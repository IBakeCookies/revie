import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import BoxDate from '$lib/presentation/components/box-date.svelte';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2024-05-01T10:00:00Z'));
});

afterEach(() => {
	vi.useRealTimers();
});

// Two cases, and only two: what the box renders is asserted by the story beside this
// file. These are here because the interval is a second long — fake timers are the
// only deterministic cover of it, and a story would catch a tick by luck.
describe('box-date.svelte', () => {
	it('keeps the clock ticking', async () => {
		const screen = await render(BoxDate);

		// The interval is registered by an $effect, which has to run first.
		flushSync();

		const before = screen.container.textContent;

		vi.setSystemTime(new Date('2024-05-01T10:00:05Z'));
		vi.advanceTimersByTime(1000);
		flushSync();

		expect(screen.container.textContent).not.toBe(before);
	});

	it('stops the interval when it is unmounted', async () => {
		const screen = await render(BoxDate);

		flushSync();
		screen.unmount();

		expect(vi.getTimerCount()).toBe(0);
	});
});
