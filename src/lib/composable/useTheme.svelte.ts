import { onMount } from 'svelte';
import { browser } from '$app/environment';

type ThemeName = 'solid-light' | 'solid-dark' | 'glass-light' | 'glass-dark' | 'cyber-punk';

interface ThemeItem {
	name: ThemeName;
	css: string[];
}

const themes: ThemeItem[] = [
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

interface UseThemeReturn {
	theme: ThemeName;
	themes: ThemeItem[];
	onToggleTheme: (newTheme: ThemeName) => void;
}

const localStorageKey = 'theme';
let theme = $state<ThemeName>('solid-light');

export const useTheme = (): UseThemeReturn => {
	const classesToAdd = $derived.by<string[]>(() => {
		return themes.find((t) => t.name === theme)?.css ?? [];
	});

	const classesToRemove = $derived.by<string[]>(() => {
		return themes.map((t) => t.css).flat();
	});

	function onToggleTheme(newTheme: ThemeName): void {
		theme = newTheme;

		localStorage.setItem(localStorageKey, theme);
	}

	onMount(() => {
		const storedTheme = localStorage.getItem(localStorageKey) as ThemeName;

		if (storedTheme) {
			theme = storedTheme;

			return;
		}

		const isDarkThemePreferred =
			window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

		if (!isDarkThemePreferred) {
			return;
		}

		theme = 'solid-dark';
	});

	$effect(() => {
		document.documentElement.classList.remove(...classesToRemove);
		document.documentElement.classList.add(...classesToAdd);
	});

	return {
		theme,
		themes,
		onToggleTheme
	};
};
