import { getContext, setContext, onMount } from 'svelte';
import { browser } from '$app/environment';
// Appearance goes through business, never straight to the cookie repository:
// data -> business -> presentation. Business also narrows the write signatures
// to ThemeName, so a theme outside the catalogue cannot be persisted from here.
import {
	readClientAppearance,
	updateScenerySeed,
	updateSceneryMotion,
	updateTheme,
} from '$lib/business/model/appearance';
import {
	DEFAULT_DARK_THEME,
	DEFAULT_THEME,
	getClassesToAdd,
	resolveThemeName,
	randomScenerySeed,
	themes,
	type ThemeName,
} from '$lib/business/model/theme';

const CONTEXT_KEY = Symbol();
/* Every class any theme stamps, so a switch removes whatever the last one added.
   Module scope, not `$derived`: the catalogue is a constant and has no reactive input. */
const ALL_THEME_CLASSES = themes.map((t) => t.css).flat();

/**
 * Appearance as shared reactive state: the active theme, the per-user scenery
 * seed, and whether scenery motion is paused — each mirrored into a cookie so
 * the SERVER can stamp the right classes into the HTML before first paint.
 *
 * The catalogue lives in `business/model/theme.ts` and the cookies in
 * `data/repository/appearance-repository.ts`; this class owns only the
 * reactive state and the initial-value reconciliation, which is the subtle
 * part (three sources: SSR payload, cookie, OS preference).
 */
export class ThemeStore {
	#theme = $state<ThemeName>(DEFAULT_THEME);

	// per-user scenery seed: minted server-side (+layout.server.ts cookie),
	// identical on both ends so the SSR-inlined style never shifts
	#scenerySeed = $state<number>(0);

	// whether animated scenery motion is paused; cookie-backed like theme,
	// defaults to prefers-reduced-motion when no cookie says otherwise
	#sceneryPaused = $state<boolean>(false);

	// the OS setting, tracked live: `scenery/index.css` pauses motion under it
	// with !important, so nothing the pause/resume control does can be honored
	#prefersReducedMotion = $state<boolean>(false);

	#classesToAdd = $derived.by<string[]>(() => {
		return getClassesToAdd(this.#theme);
	});

	constructor(
		initialTheme?: ThemeName,
		initialScenerySeed?: number,
		initialSceneryPaused?: boolean,
	) {
		// A cached or prerendered document carries a serialized payload that may be
		// stale — the cookie is the source of truth, and that holds for all three:
		// the seed can have been rerolled and the motion toggled in another tab
		// since this HTML was produced. Read once, applied below.
		const cookie = browser ? readClientAppearance() : undefined;
		// An explicit preference from EITHER source, so the OS query below still
		// only seeds when neither has one. The cookie wins over the payload because
		// it is the more recent record of the same choice.
		const seededPaused = cookie?.sceneryPaused ?? initialSceneryPaused;

		// No client-side mint: an absent seed falls back to the payload the server
		// minted, never to a fresh number, which would shift the scenery.
		this.#scenerySeed = cookie?.scenerySeed ?? initialScenerySeed ?? 0;
		this.#sceneryPaused = seededPaused ?? false;

		$effect(() => {
			document.documentElement.classList.remove(...ALL_THEME_CLASSES);
			document.documentElement.classList.add(...this.#classesToAdd);
		});

		$effect(() => {
			document.documentElement.classList.toggle('scenery-paused', this.#sceneryPaused);
		});

		// Tracked rather than read once: the OS setting can flip mid-session and
		// the CSS honors it immediately, so the control has to appear/disappear
		// with it. No cookie also means no explicit preference yet, in which
		// case the same query seeds the initial pause state — once, so a later
		// flip cannot overwrite a choice the user has made since.
		onMount(() => {
			const query = window.matchMedia('(prefers-reduced-motion: reduce)');

			const sync = () => {
				this.#prefersReducedMotion = query.matches;
			};

			sync();

			if (seededPaused === undefined && query.matches) {
				this.#sceneryPaused = true;
			}

			query.addEventListener('change', sync);

			return () => query.removeEventListener('change', sync);
		});

		// Already resolved against the catalogue by business, so it names a theme
		// that exists — see the stale-cookie fall-through below for the other case.
		if (cookie?.theme) {
			this.#theme = cookie.theme;

			return;
		}

		// a stale cookie may still name a deleted theme — fall through to defaults
		const seededTheme = resolveThemeName(initialTheme);

		if (seededTheme) {
			this.#theme = seededTheme;

			return;
		}

		onMount(() => {
			const isDarkThemePreferred =
				window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

			if (!isDarkThemePreferred) {
				return;
			}

			this.#theme = DEFAULT_DARK_THEME;
		});
	}

	get theme() {
		return this.#theme;
	}

	get label() {
		return themes.find((t) => t.name === this.#theme)?.label ?? this.#theme;
	}

	get themes() {
		return themes;
	}

	get scenerySeed() {
		return this.#scenerySeed;
	}

	get sceneryPaused() {
		return this.#sceneryPaused;
	}

	/** False while the OS asks for reduced motion — see `#prefersReducedMotion`. */
	get sceneryMotionToggleable() {
		return !this.#prefersReducedMotion;
	}

	switchTheme(newTheme: ThemeName): void {
		this.#theme = newTheme;

		updateTheme(newTheme);
	}

	rerollScenery(): void {
		this.#scenerySeed = randomScenerySeed();

		updateScenerySeed(this.#scenerySeed);
	}

	toggleSceneryMotion(): void {
		this.#sceneryPaused = !this.#sceneryPaused;

		updateSceneryMotion(this.#sceneryPaused);
	}
}

export function setThemeStore(
	initialTheme?: ThemeName,
	initialScenerySeed?: number,
	initialSceneryPaused?: boolean,
): ThemeStore {
	return setContext<ThemeStore>(
		CONTEXT_KEY,
		new ThemeStore(initialTheme, initialScenerySeed, initialSceneryPaused),
	);
}

export function getThemeStore(): ThemeStore {
	return getContext<ThemeStore>(CONTEXT_KEY);
}
