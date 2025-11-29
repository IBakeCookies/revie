import { getContext, setContext } from 'svelte';
import { onMount } from 'svelte';

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
const themeStorageKey = 'theme';

export function getClassesToAdd(themeName: ThemeName): string[] {
	return themes.find((t) => t.name === themeName)?.css ?? [];
}

export class ThemeStore {
	#theme = $state<ThemeName>('solid-light');
	#themes: ThemeItem[] = themes;

	#classesToAdd = $derived.by<string[]>(() => {
		return getClassesToAdd(this.#theme);
	});

	#classesToRemove = $derived.by<string[]>(() => {
		return themes.map((t) => t.css).flat();
	});

	constructor(initialTheme: ThemeName) {
		this.#theme = initialTheme;

		$effect(() => {
			document.documentElement.classList.remove(...this.#classesToRemove);
			document.documentElement.classList.add(...this.#classesToAdd);
		});

		if (initialTheme) {
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

	get theme() {
		return this.#theme;
	}

	get themes() {
		return this.#themes;
	}

	get classesToAdd() {
		return this.#classesToAdd;
	}

	get classesToRemove() {
		return this.#classesToRemove;
	}

	switchTheme(newTheme: ThemeName): void {
		this.#theme = newTheme;

		document.cookie = `${themeStorageKey}=${newTheme}; path=/; max-age=31536000; SameSite=Lax`;
	}
}

export function setThemeStore(initialTheme: ThemeName): ThemeStore {
	return setContext<ThemeStore>(CONTEXT_KEY, new ThemeStore(initialTheme));
}

export function getThemeStore(): ThemeStore {
	return getContext<ThemeStore>(CONTEXT_KEY);
}
