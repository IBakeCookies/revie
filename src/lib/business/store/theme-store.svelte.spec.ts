import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_THEME } from '$lib/business/model/theme';
/* Namespace rather than named imports: this file is rune-compiled, where `$`
   names are reserved (`dollar_prefix_invalid`). */
import * as appearanceRepository from '$lib/data/repository/appearance-repository';
import ThemeStoreHarness from '$lib/test/theme-store-harness.svelte';

/**
 * The jar spy. `writeCookie` reads `location.protocol` INSIDE itself for
 * `secure`, so the only stable seam to assert a browser-side cookie write on
 * is the repository's writers — everything below them ends in
 * `document.cookie`, which a test cannot read back with its attributes intact.
 * `$readAppearance` stays unused: the harness seeds initial values via props,
 * as the SSR payload does.
 */
vi.mock('$lib/data/repository/appearance-repository', () => ({
	$readAppearance: vi.fn(() => ({
		theme: undefined,
		scenerySeed: undefined,
		sceneryPaused: undefined,
	})),
	$updateTheme: vi.fn(),
	$updateScenerySeed: vi.fn(),
	$updateSceneryMotion: vi.fn(),
	$createScenerySeedCookie: vi.fn(),
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

describe('ThemeStore mirrors every change back to its cookie', () => {
	beforeEach(() => {
		vi.mocked(appearanceRepository.$updateTheme).mockClear();
		vi.mocked(appearanceRepository.$updateScenerySeed).mockClear();
		vi.mocked(appearanceRepository.$updateSceneryMotion).mockClear();
	});

	it('switching writes the theme cookie with the chosen name', async () => {
		stubReducedMotion(false);

		const screen = await render(ThemeStoreHarness, {});

		await screen.getByTestId('switch-theme').click();

		await expect.element(screen.getByTestId('theme')).toHaveTextContent('aurora');
		expect(vi.mocked(appearanceRepository.$updateTheme).mock.calls).toEqual([['aurora']]);
	});

	it('rerolling mints a seed in range and persists that exact value', async () => {
		stubReducedMotion(false);

		const screen = await render(ThemeStoreHarness, {
			initialScenerySeed: 3,
		});

		await screen.getByTestId('reroll-scenery').click();

		const [seed] = vi.mocked(appearanceRepository.$updateScenerySeed).mock.calls[0] ?? [];
		// `randomScenerySeed`'s own contract: a 32-bit unsigned integer.
		expect(Number.isInteger(seed)).toBe(true);
		expect(seed).toBeGreaterThanOrEqual(0);
		expect(seed).toBeLessThan(0x100000000);

		await expect.element(screen.getByTestId('scenery-seed')).toHaveTextContent(String(seed));
		expect(vi.mocked(appearanceRepository.$updateScenerySeed).mock.calls).toEqual([[seed]]);
	});

	it('toggling motion writes the flipped preference', async () => {
		stubReducedMotion(false);

		const screen = await render(ThemeStoreHarness, {
			initialSceneryPaused: false,
		});

		await screen.getByTestId('toggle-motion').click();

		await expect.element(screen.getByTestId('scenery-paused')).toHaveTextContent('true');
		expect(vi.mocked(appearanceRepository.$updateSceneryMotion).mock.calls).toEqual([[true]]);
	});
});
