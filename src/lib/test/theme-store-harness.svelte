<script lang="ts">
	import type { ThemeName } from '$lib/business/model/theme';
	import { setThemeStore } from '$lib/business/store/theme-store.svelte';

	type Props = {
		/* A plain string, not a ThemeName: the SSR payload can name a theme that was
		   deleted two deploys ago, which is the case `resolveThemeName` exists for and
		   the only way to reach it from a test. */
		initialTheme?: string;
		initialScenerySeed?: number;
		initialSceneryPaused?: boolean;
	};

	let { initialTheme, initialScenerySeed, initialSceneryPaused }: Props = $props();

	/* Test support: the constructor registers effects and `setContext` needs a component
	   being initialised, so the store can only be built inside one of these — a spec file
	   is not compiled as a rune module. The seed is read once, as the real one is. */
	// svelte-ignore state_referenced_locally
	const themeStore = setThemeStore(
		initialTheme as ThemeName | undefined,
		initialScenerySeed,
		initialSceneryPaused,
	);
</script>

<p data-testid="theme">{themeStore.theme}</p>
<p data-testid="motion-toggleable">{themeStore.sceneryMotionToggleable}</p>
<p data-testid="scenery-seed">{themeStore.scenerySeed}</p>
<p data-testid="scenery-paused">{themeStore.sceneryPaused}</p>

<!-- Test support: the setters are how a change reaches its cookie, so a spec
     needs a way to fire all three. 'aurora' is any catalogue entry. -->
<button data-testid="switch-theme" onclick={() => themeStore.switchTheme('aurora')}>
	switch
</button>
<button data-testid="reroll-scenery" onclick={() => themeStore.rerollScenery()}>reroll</button>
<button data-testid="toggle-motion" onclick={() => themeStore.toggleSceneryMotion()}>
	toggle
</button>
