<script lang="ts">
	import type { LayoutProps } from './$types';
	import type { ThemeName } from '$lib/store/theme-store.svelte';
	import type { Locale } from '$lib/paraglide/runtime';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils/style';
	import { setThemeStore } from '$lib/store/theme-store.svelte';
	import Dropdown from '$lib/components/dropdown.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';

	let { children, data }: LayoutProps = $props();
	let sentinel = $state<HTMLElement | undefined>();
	let isNavAtTheTop = $state(false);

	const themeStore = setThemeStore(() => data.theme);

	// Keyed by the union types, so a new theme or locale fails to compile until it
	// has a translated label.
	const themeLabels: Record<ThemeName, () => string> = {
		'solid-light': m.theme_solid_light,
		'solid-dark': m.theme_solid_dark,
		'glass-light': m.theme_glass_light,
		'glass-dark': m.theme_glass_dark,
		'cyber-punk': m.theme_cyber_punk
	};

	const localeLabels: Record<Locale, () => string> = {
		en: m.language_en,
		de: m.language_de
	};

	onMount(() => {
		if (!sentinel) {
			return;
		}

		const observer = new IntersectionObserver((entries) => {
			isNavAtTheTop = !entries[0].isIntersecting;
		});

		observer.observe(sentinel);

		return () => observer.disconnect();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<main class="flex flex-col min-h-screen p-box-xl backdrop-blur">
	<div bind:this={sentinel}></div>

	<header
		class={cn(
			'bg-box-primary flex-wrap w-full sticky top-0 z-10 rounded-b solid:border border-glass px-box-lg py-box-md max-w-screen-2xl mx-auto flex items-center glass-y',
			{
				'rounded-t': !isNavAtTheTop,
				'border-t-transparent': isNavAtTheTop
			}
		)}
	>
		<h1 class="font-bold text-2xl">{m.app_title()}</h1>

		{#each data.pages as page (page.path)}
			<a href={page.path} class="ml-ty-list-md">
				{page.name}
			</a>
		{/each}

		<div class="ml-auto flex items-center gap-ty-list-md">
			<Dropdown>
				{#snippet trigger()}
					{m.theme_label()}
				{/snippet}

				{#each themeStore.themes as theme (theme.name)}
					<button
						class={cn('py-ty-list-xs px-box-md cursor-pointer block w-full text-left', {
							'font-bold': themeStore.theme === theme.name
						})}
						onclick={() => themeStore.switchTheme(theme.name)}
					>
						{themeLabels[theme.name]()}
					</button>
				{/each}
			</Dropdown>

			<Dropdown>
				{#snippet trigger()}
					{m.language_label()}
				{/snippet}

				{#each locales as locale (locale)}
					<button
						class={cn('py-ty-list-xs px-box-md cursor-pointer block w-full text-left', {
							'font-bold': getLocale() === locale
						})}
						onclick={() => setLocale(locale)}
					>
						{localeLabels[locale]()}
					</button>
				{/each}
			</Dropdown>
		</div>
	</header>

	<div
		class="grid grid-cols-12 gap-grid-lg mt-grid-lg border-glass p-box-xl max-w-screen-2xl mx-auto w-full rounded solid:border"
	>
		{@render children()}
	</div>
</main>
