<script lang="ts">
	import type { LayoutProps } from './$types';
	import type { Locale } from '$lib/paraglide/runtime';
	import '$lib/presentation/style/app.css';
	import favicon from '$lib/presentation/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { page as currentPage } from '$app/state';
	import { cn } from '$lib/utils/style';
	import { setThemeStore } from '$lib/business/store/theme-store.svelte';
	import { setToastStore } from '$lib/business/store/toast-store.svelte';
	import { sceneryStyle } from '$lib/presentation/util/scenery-seed';
	import { dataSceneryStyle } from '$lib/presentation/util/scenery-time';
	import Dropdown from '$lib/presentation/components/dropdown.svelte';
	import Toasts from '$lib/presentation/components/toasts.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';

	let { children, data }: LayoutProps = $props();
	let sentinel = $state<HTMLElement | undefined>();
	let isNavAtTheTop = $state(false);

	// data.theme/scenerySeed/sceneryPaused are init seeds only — the store owns
	// the appearance from here on and mirrors it into the cookies itself.
	// svelte-ignore state_referenced_locally
	const themeStore = setThemeStore(data.theme, data.scenerySeed, data.sceneryPaused);

	// Set here rather than per page, so a failure reported while navigating survives
	// the page component being torn down and rebuilt.
	const toasts = setToastStore();

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
	// Rounded, because the panel is: a square-cornered hover fill inside a rounded
	// border reads as a clipping bug on the first and last row.
	const menuItem =
		'py-text-xs px-box-md cursor-pointer w-full text-left rounded-md hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

	// The config page this URL is on, or undefined — /admin is a path the guard takes
	// back and the configured 404 was never a key, so neither of them is one.
	const configPage = $derived(data.pages.find((page) => page.path === currentPage.url.pathname));

	// The page's own name first, so a browser tab and a bookmark say which page they
	// are — nothing in the app owned <title> before, which is the one axe violation
	// no component story can cover.
	const pageName = $derived(configPage?.name);

	// Derived, not inlined into the style attribute beside dataSceneryStyle: the seed
	// vars only change on a reroll, while sceneryNow ticks every minute — and two of
	// them (meridian's ribbons, dunes' ridges) are whole SVG data URIs, rebuilt on
	// every tick for an identical result if the two share one expression.
	const sceneryVars = $derived(sceneryStyle(themeStore.scenerySeed));

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
	<title>{pageName ? `${pageName} · ${m.app_title()}` : m.app_title()}</title>
	<link rel="icon" href={favicon} />
	<!-- Pinned-to-home-screen plumbing. The manifest's strings are static on
	     purpose (a static file cannot be localized — it names the product), and
	     theme-color is two OS-scoped values rather than a JS mirror of the theme
	     catalogue: the light default's white page and the revie ground the
	     favicon already encodes. -->
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
	<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#18262f" />
</svelte:head>

<!-- Theme scenery: fixed decorative layers behind the app. display:none by
     default; a theme opts in by styling the helpers in style/scenery/. The
     seeded vars vary each theme's arrangement per user (utils/scenery-seed.ts);
     the data vars carry the clock-driven themes' state (utils/scenery-time.ts). -->
<div class="theme-scenery" aria-hidden="true" style="{sceneryVars}; {dataSceneryStyle(sceneryNow)}">
	<div class="theme-helper-1"></div>
	<div class="theme-helper-2"></div>
	<div class="theme-helper-3"></div>
	<div class="theme-helper-4"></div>
</div>

<!-- No backdrop-blur on this wrapper or on the <main> below: a blurred
     full-width rectangle averages the scenery inside it to a flat wash, and on
     the line-art themes (meridian, city-windows, orbit) that erases the art
     exactly where the page covers it. Each translucent surface blurs its own
     footprint instead, so the gaps between cards keep the scenery crisp. -->
<!-- A plain div rather than <main>, so <header> is main's SIBLING and maps to `banner`
     instead of `generic`. It also has to be this element that carries min-h-screen: a
     sticky child can only travel inside its parent's box, so a wrapper the header's own
     height would give it nowhere to stick to.
     `page-shell` is a hook for themes.css, not a utility: it names the element that
     spans the page, which is what a theme wanting to lay a scrim over its own backdrop
     has to target. That used to be `<main>` and is not any more. -->
<!-- The page padding runs the responsive ramp the --spacer-page-* tokens were added
     for and nothing used: one flat 24px spent 12% of a 390px phone's width before a
     card's own padding even started, and left a desktop tighter than its cards. -->
<div class="page-shell flex min-h-screen flex-col p-page-sm md:p-page-md xl:p-page">
	<div bind:this={sentinel}></div>

	<!-- `@container/header`, and every reflow below queries it rather than the viewport:
	     the header is the page's own width minus a padding ramp, so a `sm:` breakpoint
	     was answering a question about the window when the question is about the bar. -->
	<header
		class={cn(
			'@container/header bg-surface-card border-line-strong shadow-card sticky top-0 z-10 mx-auto flex w-full max-w-screen-2xl flex-wrap items-center gap-x-text-lg gap-y-text-xs rounded-b-2xl border px-box-lg py-box-sm backdrop-blur',
			{
				'rounded-t-2xl': !isNavAtTheTop,
				'border-t-transparent': isNavAtTheTop,
			},
		)}
	>
		<!-- The mark is the favicon, so the tab and the bar agree on what this is. Its
		     colours are fixed on purpose — it is the app's identity, not a themed
		     surface — which is also why it carries its own rounding and no border. -->
		<div class="flex items-center gap-text-xs">
			<img src={favicon} alt="" class="size-7 shrink-0 rounded-md" />
			<h1 class="text-xl font-bold tracking-tight @xl/header:text-2xl">{m.app_title()}</h1>
		</div>

		<!-- A recessed track with a raised chip on the current page, rather than two bare
		     words beside the title: the pages are a switch between states of one thing, and
		     an inset rail is what says so. The header's two interactive groups — this and
		     the appearance menus — use the same track, so the bar reads as one control
		     surface instead of a heading with loose parts stuck to it. -->
		<nav class="bg-surface-inset flex items-center gap-text-3xs rounded-full p-box-3xs">
			{#each data.pages as page (page.path)}
				<a
					href={page.path}
					aria-current={currentPage.url.pathname === page.path ? 'page' : undefined}
					class={cn(
						'hover:text-ty-primary focus-visible:ring-ring rounded-full px-box-sm py-box-3xs text-sm transition focus-visible:ring-2 focus-visible:outline-none',
						{
							'bg-surface-card shadow-card text-ty-primary font-semibold':
								currentPage.url.pathname === page.path,
							'text-ty-secondary': currentPage.url.pathname !== page.path,
						},
					)}
				>
					{page.name}
				</a>
			{/each}
		</nav>

		<!-- A full row of its own until the title, the nav and both menus fit on one
		     line: the three of them together overflow a phone, and letting the flex
		     wrap decide left the menus stranded mid-row under the heading. -->
		<div
			class="bg-surface-inset ml-auto flex w-full items-center gap-text-3xs rounded-full p-box-3xs @2xl/header:w-auto"
		>
			<!-- flex-1 only while the menus have a row to themselves: two equal buttons
			     filling a phone's width read as a control bar, where two content-width
			     ones adrift in the middle of it read as leftovers. -->
			<Dropdown
				class="flex-1 @2xl/header:flex-none"
				panelClass="nice-scrollbar max-h-[min(80vh,32rem)] overflow-y-auto"
			>
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

			<Dropdown class="flex-1 @2xl/header:flex-none">
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

			<!-- In the control track rather than the config-pages rail: /admin is a reserved
			     path the guard wins over, not a configured page, so it does not belong in a
			     rail driven by config's own keys. Same trigger affordance as the two menus and
			     the same conditional flex-1, so a third item still fills a phone's row
			     instead of stranding the menus mid-line. Labelled for the area: signed out,
			     handleAdmin redirects it to the login form.

			     It still marks itself current the way the rail's links do — the placement is
			     what differs, not whether a screen reader is told where it is. Exact match,
			     so the login form it redirects to is not announced as this destination. -->
			{#if data.adminEnabled}
				<a
					href="/admin"
					aria-current={currentPage.url.pathname === '/admin' ? 'page' : undefined}
					class="hover:bg-surface-card hover:shadow-card focus-visible:ring-ring flex flex-1 items-center justify-center rounded-full px-box-sm py-box-3xs text-sm transition focus-visible:ring-2 focus-visible:outline-none @2xl/header:flex-none"
				>
					{m.admin_title()}
				</a>

				<!-- The same area, opened at the page being looked at rather than at the top of a
				     form listing every one of them. The fragment is the config key itself, which
				     is the id the admin page puts on that page's heading — so kit's own
				     deep-link handling does the scroll AND moves the sequential focus starting
				     point with it, and neither side needs code for either.

				     Only on a config page: the two paths that are not one have no key to name.
				     Icon-only, so the accessible name is the whole of what says which page it
				     edits — and it takes no flex-1, because a glyph stretched over a third of a
				     phone's row reads as a third menu rather than as a shortcut. -->
				{#if configPage}
					<a
						href="/admin#{configPage.path}"
						aria-label={m.admin_edit_page({
							name: configPage.name,
						})}
						class="hover:bg-surface-card hover:shadow-card focus-visible:ring-ring flex items-center justify-center rounded-full px-box-sm py-box-3xs transition focus-visible:ring-2 focus-visible:outline-none"
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="size-4"
							aria-hidden="true"
						>
							<path d="M12 20h9" />
							<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
						</svg>
					</a>
				{/if}
			{/if}
		</div>
	</header>

	<main class="mx-auto mt-grid-lg grid w-full max-w-screen-2xl grid-cols-12 gap-grid-lg">
		{@render children()}
	</main>
</div>

<!-- Outside the page wrapper: the region is fixed to the viewport, so the padding ramp
     and main's 12-column grid have nothing to say about it. -->
<Toasts messages={toasts.messages} ondismiss={(message) => toasts.dismiss(message)} />
