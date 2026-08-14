import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_THEME } from '$lib/business/model/theme';
import ThemeStoreHarness from '$lib/test/theme-store-harness.svelte';

// Mocked at the store's own boundary: business. The cookie belongs to data, and whether
// the test browser happens to carry one must not decide what these assert.
// `vi.hoisted` because the factory runs while the mocked module is imported, which is
// before a plain top-level `let` in this file has left its TDZ.
const cookie = vi.hoisted(() => ({
	theme: undefined as string | undefined,
	scenerySeed: undefined as number | undefined,
	sceneryPaused: undefined as boolean | undefined,
}));

vi.mock('$lib/business/model/appearance', () => ({
	readClientAppearance: () => cookie,
	updateTheme: () => {},
	updateScenerySeed: () => {},
	updateSceneryMotion: () => {},
}));

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

	cookie.theme = undefined;
	cookie.scenerySeed = undefined;
	cookie.sceneryPaused = undefined;
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

	it('lets the cookie win over a stale SSR payload for the seed and the pause state', async () => {
		stubReducedMotion(false);
		cookie.scenerySeed = 7;
		cookie.sceneryPaused = true;

		const screen = await render(ThemeStoreHarness, {
			initialScenerySeed: 3,
			initialSceneryPaused: false,
		});

		// A cached document serializes what the cookies said when it was rendered; a
		// reroll or a pause in another tab since then is what the cookie now holds.
		await expect.element(screen.getByTestId('scenery-seed')).toHaveTextContent('7');
		await expect.element(screen.getByTestId('scenery-paused')).toHaveTextContent('true');
	});

	it('keeps the SSR payload when no cookie names one, rather than minting a seed', async () => {
		stubReducedMotion(false);

		const screen = await render(ThemeStoreHarness, {
			initialScenerySeed: 3,
			initialSceneryPaused: true,
		});

		await expect.element(screen.getByTestId('scenery-seed')).toHaveTextContent('3');
		await expect.element(screen.getByTestId('scenery-paused')).toHaveTextContent('true');
	});

	it('does not let prefers-reduced-motion seed over a cookie that says motion is on', async () => {
		stubReducedMotion(true);
		cookie.sceneryPaused = false;

		// The payload is undefined, so only the cookie records a choice — and the OS
		// query seeds only when neither source does.
		const screen = await render(ThemeStoreHarness, {});

		await expect.element(screen.getByTestId('scenery-paused')).toHaveTextContent('false');
	});
});
