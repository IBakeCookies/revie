import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_THEME } from '$lib/business/model/theme';
import ThemeStoreHarness from '$lib/test/theme-store-harness.svelte';

/** Stands in for the OS setting, which a test cannot flip. Returns the flip. */
function stubReducedMotion(initial: boolean): (next: boolean) => void {
	const listeners = new Set<() => void>();
	let matches = initial;

	vi.spyOn(window, 'matchMedia').mockImplementation(
		(query: string) =>
			({
				// A getter, not a snapshot: the store keeps the query object from mount and
				// reads `matches` off it when the change fires.
				get matches() {
					return query.includes('reduced-motion') && matches;
				},
				addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
				removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
			}) as unknown as MediaQueryList,
	);

	return (next: boolean) => {
		matches = next;
		listeners.forEach((listener) => listener());
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('ThemeStore', () => {
	it('tracks prefers-reduced-motion live, because the OS can flip it mid-session', async () => {
		const setReducedMotion = stubReducedMotion(false);
		const screen = await render(ThemeStoreHarness, {});

		await expect.element(screen.getByTestId('motion-toggleable')).toHaveTextContent('true');

		setReducedMotion(true);

		// `scenery/index.css` pauses motion under it with !important and no opt-out, so a
		// control still offering to resume would label a state it cannot change.
		await expect.element(screen.getByTestId('motion-toggleable')).toHaveTextContent('false');
	});

	it('falls back to the default when the seeded theme is no longer in the catalogue', async () => {
		stubReducedMotion(false);

		const screen = await render(ThemeStoreHarness, {
			initialTheme: 'theme-removed-two-deploys-ago',
		});

		// Cookies outlive deploys. Casting instead of resolving leaves the theme naming no
		// CSS classes at all, and the app renders unstyled.
		await expect.element(screen.getByTestId('theme')).toHaveTextContent(DEFAULT_THEME);
	});

	it('keeps a seeded theme that still exists', async () => {
		stubReducedMotion(false);

		const screen = await render(ThemeStoreHarness, {
			initialTheme: 'abyss',
		});

		await expect.element(screen.getByTestId('theme')).toHaveTextContent('abyss');
	});

	it('seeds the scenery from the SSR payload, which IS the resolved cookie value', async () => {
		stubReducedMotion(false);

		const screen = await render(ThemeStoreHarness, {
			initialScenerySeed: 3,
			initialSceneryPaused: true,
		});

		// The same request read the same cookies to produce this payload, so a
		// client-side re-read could only ever match it — and no client-side mint,
		// which would shift the scenery away from the SSR'd style attribute.
		await expect.element(screen.getByTestId('scenery-seed')).toHaveTextContent('3');
		await expect.element(screen.getByTestId('scenery-paused')).toHaveTextContent('true');
	});

	it('honours prefers-reduced-motion when the payload records no choice', async () => {
		stubReducedMotion(true);

		const screen = await render(ThemeStoreHarness, {});

		await expect.element(screen.getByTestId('scenery-paused')).toHaveTextContent('true');
	});

	it('does not let prefers-reduced-motion seed over a payload that says motion is on', async () => {
		stubReducedMotion(true);

		// The payload records a choice, and the OS query seeds only when it does not.
		const screen = await render(ThemeStoreHarness, {
			initialSceneryPaused: false,
		});

		await expect.element(screen.getByTestId('scenery-paused')).toHaveTextContent('false');
	});
});
