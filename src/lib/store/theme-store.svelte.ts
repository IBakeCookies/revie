import { getContext, onMount, setContext } from 'svelte';

export type ThemeName = 'solid-light' | 'solid-dark' | 'glass-light' | 'glass-dark' | 'cyber-punk';

interface ThemeItem {
	name: ThemeName;
	css: string[];
}

export const themes: ThemeItem[] = [
	{
		name: 'solid-light',
		css: ['solid', 'solid-light']
	},
	{
		name: 'solid-dark',
		css: ['solid', 'solid-dark']
	},
	{
		name: 'glass-light',
		css: ['glass', 'glass-light']
	},
	{
		name: 'glass-dark',
		css: ['glass', 'glass-dark']
	},
	{
		name: 'cyber-punk',
		css: ['cyber-punk']
	}
] as const;

const CONTEXT_KEY = Symbol();
const THEME_COOKIE = 'theme';
const allThemeClasses = themes.flatMap((item) => item.css);

export function getClassesToAdd(themeName: ThemeName): string[] {
	return themes.find((t) => t.name === themeName)?.css ?? [];
}

export class ThemeStore {
	#theme = $state<ThemeName>('solid-light');

	#classesToAdd = $derived.by<string[]>(() => getClassesToAdd(this.#theme));

	/**
	 * @param initialTheme read lazily so the caller can hand over a prop without
	 * capturing it outside of a reactive context.
	 */
	constructor(initialTheme: () => ThemeName | undefined) {
		// Only runs on the client; the server stamps the class onto <html> directly.
		$effect(() => {
			document.documentElement.classList.remove(...allThemeClasses);
			document.documentElement.classList.add(...this.#classesToAdd);
		});

		const theme = initialTheme();

		if (theme) {
			this.#theme = theme;

			return;
		}

		onMount(() => {
			const isDarkThemePreferred =
				window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

			if (!isDarkThemePreferred) {
				return;
			}

			this.#theme = 'solid-dark';
		});
	}

	get theme(): ThemeName {
		return this.#theme;
	}

	get themes(): ThemeItem[] {
		return themes;
	}

	switchTheme(newTheme: ThemeName): void {
		this.#theme = newTheme;

		document.cookie = `${THEME_COOKIE}=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;
	}
}

export function setThemeStore(initialTheme: () => ThemeName | undefined): ThemeStore {
	return setContext<ThemeStore>(CONTEXT_KEY, new ThemeStore(initialTheme));
}

export function getThemeStore(): ThemeStore {
	return getContext<ThemeStore>(CONTEXT_KEY);
}
