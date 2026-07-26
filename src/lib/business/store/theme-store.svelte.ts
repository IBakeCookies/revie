import { getContext, setContext, onMount } from 'svelte';
import { browser } from '$app/environment';
// Appearance goes through business, never straight to the cookie repository:
// data -> business -> presentation. Business also narrows the write signatures
// to ThemeName, so a theme outside the catalogue cannot be persisted from here.
import {
	readClientTheme,
	updateScenerySeed,
	updateSceneryMotion,
	updateTheme
} from '$lib/business/model/appearance';
import {
	DEFAULT_DARK_THEME,
	DEFAULT_THEME,
	getClassesToAdd,
	resolveThemeName,
	randomScenerySeed,
	themes,
	type ThemeItem,
	type ThemeName
} from '$lib/business/model/theme';

const CONTEXT_KEY = Symbol();

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
	#themes: ThemeItem[] = themes;

	// per-user scenery seed: minted server-side (+layout.server.ts cookie),
	// identical on both ends so the SSR-inlined style never shifts
	#scenerySeed = $state<number>(0);

	// whether animated scenery motion is paused; cookie-backed like theme,
	// defaults to prefers-reduced-motion when no cookie says otherwise
	#sceneryPaused = $state<boolean>(false);

	#classesToAdd = $derived.by<string[]>(() => {
		return getClassesToAdd(this.#theme);
	});

	#classesToRemove = $derived.by<string[]>(() => {
		return themes.map((t) => t.css).flat();
	});

	constructor(
		initialTheme?: ThemeName,
		initialScenerySeed?: number,
		initialSceneryPaused?: boolean
	) {
		this.#scenerySeed = initialScenerySeed ?? 0;
		this.#sceneryPaused = initialSceneryPaused ?? false;

		$effect(() => {
			document.documentElement.classList.remove(...this.#classesToRemove);
			document.documentElement.classList.add(...this.#classesToAdd);
		});

		$effect(() => {
			document.documentElement.classList.toggle('scenery-paused', this.#sceneryPaused);
		});

		// no cookie means no explicit preference yet — honor the OS setting,
		// same onMount/matchMedia approach as the dark-theme default below
		if (initialSceneryPaused === undefined) {
			onMount(() => {
				const prefersReducedMotion =
					window.matchMedia &&
					window.matchMedia('(prefers-reduced-motion: reduce)').matches;

				if (!prefersReducedMotion) return;

				this.#sceneryPaused = true;
			});
		}

		// a cached or prerendered document carries a serialized theme that may be
		// stale — the cookie is the source of truth, so it wins over initialTheme
		if (browser) {
			const cookieTheme = readClientTheme();

			if (cookieTheme) {
				this.#theme = cookieTheme;

				return;
			}
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
		return this.#themes;
	}

	get scenerySeed() {
		return this.#scenerySeed;
	}

	get sceneryPaused() {
		return this.#sceneryPaused;
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
	initialSceneryPaused?: boolean
): ThemeStore {
	return setContext<ThemeStore>(
		CONTEXT_KEY,
		new ThemeStore(initialTheme, initialScenerySeed, initialSceneryPaused)
	);
}

export function getThemeStore(): ThemeStore {
	return getContext<ThemeStore>(CONTEXT_KEY);
}
