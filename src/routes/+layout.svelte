<script lang="ts">
	import type { LayoutProps } from './$types';
	import type { Locale } from '$lib/paraglide/runtime';
	import '$lib/presentation/style/app.css';
	import favicon from '$lib/presentation/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { page as currentPage } from '$app/state';
	import { cn } from '$lib/utils/style';
	import { setThemeStore } from '$lib/business/store/theme-store.svelte';
	import { sceneryStyle } from '$lib/presentation/util/scenery-seed';
	import { dataSceneryStyle } from '$lib/presentation/util/scenery-time';
	import Dropdown from '$lib/presentation/components/dropdown.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';

	let { children, data }: LayoutProps = $props();
	let sentinel = $state<HTMLElement | undefined>();
	let isNavAtTheTop = $state(false);

	// data.theme/scenerySeed/sceneryPaused are init seeds only — the store owns
	// the appearance from here on and mirrors it into the cookies itself.
	// svelte-ignore state_referenced_locally
	const themeStore = setThemeStore(data.theme, data.scenerySeed, data.sceneryPaused);

	// Clock-driven scenery state (sundial, tide, city-windows). SSR renders
	// the server's clock; hydration never re-patches
	// the SSR'd style attribute, so re-derive from the client's clock once
	// mounted, then keep it ticking — a dashboard tab stays open all day, and a
	// minute is finer than any of these vars' visible rate.
	let sceneryNow = $state(new Date());

	// Keyed by the union type, so a new locale fails to compile until it has a
	// translated label. Theme names are not translated: the label lives in the
	// catalogue (business/model/theme.ts), as it does upstream in zenith.
	const localeLabels: Record<Locale, () => string> = {
		en: m.language_en,
		de: m.language_de,
	};

	// Shared affordances for every menu row: --surface-hover and --ring are both
	// themed, so this stays token-only. Display/layout classes stay per call site.
	const menuItem =
		'py-text-xs px-box-md cursor-pointer w-full text-left hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

	onMount(() => {
		sceneryNow = new Date();
		const id = setInterval(() => (sceneryNow = new Date()), 60_000);

		return () => clearInterval(id);
	});

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

<!-- Theme scenery: fixed decorative layers behind the app. display:none by
     default; a theme opts in by styling the helpers in style/scenery/. The
     seeded vars vary each theme's arrangement per user (utils/scenery-seed.ts);
     the data vars carry the clock-driven themes' state (utils/scenery-time.ts). -->
<div
	class="theme-scenery"
	aria-hidden="true"
	style="{sceneryStyle(themeStore.scenerySeed)}; {dataSceneryStyle(sceneryNow)}"
>
	<div class="theme-helper-1"></div>
	<div class="theme-helper-2"></div>
	<div class="theme-helper-3"></div>
	<div class="theme-helper-4"></div>
</div>

<!-- No backdrop-blur on <main> or on the content wrapper below: a blurred
     full-width rectangle averages the scenery inside it to a flat wash, and on
     the line-art themes (meridian, city-windows, orbit) that erases the art
     exactly where the page covers it. Each translucent surface blurs its own
     footprint instead, so the gaps between cards keep the scenery crisp. -->
<main class="flex flex-col min-h-screen p-box-xl">
	<div bind:this={sentinel}></div>

	<header
		class={cn(
			'bg-surface-card border-line-strong shadow-card backdrop-blur flex-wrap w-full sticky top-0 z-10 rounded-b-2xl border px-box-lg py-box-md max-w-screen-2xl mx-auto flex items-center',
			{
				'rounded-t-2xl': !isNavAtTheTop,
				'border-t-transparent': isNavAtTheTop,
			},
		)}
	>
		<h1 class="font-bold text-2xl">{m.app_title()}</h1>

		{#each data.pages as page (page.path)}
			<a
				href={page.path}
				aria-current={currentPage.url.pathname === page.path ? 'page' : undefined}
				class={cn(
					'ml-text-md rounded-md hover:text-ty-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
					{
						'font-bold': currentPage.url.pathname === page.path,
						'text-ty-secondary': currentPage.url.pathname !== page.path,
					},
				)}
			>
				{page.name}
			</a>
		{/each}

		<div class="ml-auto flex items-center gap-text-md">
			<Dropdown panelClass="nice-scrollbar max-h-[min(80vh,32rem)] overflow-y-auto">
				{#snippet trigger()}
					{m.theme_label()}
				{/snippet}

				{#each themeStore.themes as theme (theme.name)}
					<button
						class={cn(menuItem, 'flex items-center gap-text-xs', {
							'font-bold': themeStore.theme === theme.name,
						})}
						onclick={() => themeStore.switchTheme(theme.name)}
					>
						<!-- the theme's own classes scope its CSS vars to the swatch, so
						     the two slices always match themes.css -->
						<span
							class="{theme.css.join(
								' ',
							)} border-line-strong flex h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full border"
							aria-hidden="true"
						>
							<span class="h-full w-1/2" style="background: var(--surface-page)"></span>
							<span class="h-full w-1/2" style="background: var(--primary)"></span>
						</span>
						{theme.label}
					</button>
				{/each}

				<hr class="border-line-soft my-text-2xs" />

				<!-- the seed and the motion flag are appearance too, and the cookies
				     behind them are what let the server stamp the right scenery -->
				<button class={cn(menuItem, 'block')} onclick={() => themeStore.rerollScenery()}>
					{m.theme_reroll_scenery()}
				</button>

				<!-- absent under prefers-reduced-motion: the CSS pauses scenery there no
				     matter what the cookie says, so the control would only mislabel a
				     state it cannot change -->
				{#if themeStore.sceneryMotionToggleable}
					<button class={cn(menuItem, 'block')} onclick={() => themeStore.toggleSceneryMotion()}>
						{themeStore.sceneryPaused ? m.theme_resume_animations() : m.theme_pause_animations()}
					</button>
				{/if}
			</Dropdown>

			<Dropdown>
				{#snippet trigger()}
					{m.language_label()}
				{/snippet}

				{#each locales as locale (locale)}
					<button
						class={cn(menuItem, 'block', {
							'font-bold': getLocale() === locale,
						})}
						onclick={() => setLocale(locale)}
					>
						{localeLabels[locale]()}
					</button>
				{/each}
			</Dropdown>
		</div>
	</header>

	<div class="grid grid-cols-12 gap-grid-lg mt-grid-lg max-w-screen-2xl mx-auto w-full">
		{@render children()}
	</div>
</main>
