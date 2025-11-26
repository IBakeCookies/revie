<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { useTheme } from '$lib/composable/useTheme.svelte';
	import { cn } from '$lib/utils/style';
	import { setAdguardStore } from '$lib/store/adguard-store.svelte';

	let { children } = $props();
	let sentinel = $state<HTMLElement | undefined>();
	let isNavAtTheTop = $state(false);

	const { themes, onToggleTheme } = useTheme();

	setAdguardStore();

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

<main class="flex flex-col min-h-screen p-box-xl">
	<div bind:this={sentinel}></div>
	<header
		class={cn(
			'bg-box-primary p-box-xl w-full sticky top-0 z-10 backdrop-blur  cyber-punk:border rounded-b solid:border border-glass px-box-lg py-box-md max-w-screen-2xl mx-auto flex items-center glass-y',
			{
				'rounded-t': !isNavAtTheTop,
				'border-t-transparent': isNavAtTheTop
			}
		)}
	>
		<h1 class="font-bold text-2xl mr-auto">Revie Dashboard</h1>

		<div class="flex items-center gap-ty-list-md">
			{#each themes as theme}
				<button onclick={() => onToggleTheme(theme.name)}>{theme.name}</button>
			{/each}
		</div>
	</header>

	<div
		class="grid grid-cols-12 gap-grid-lg mt-grid-lg border-glass p-box-xl max-w-screen-2xl mx-auto w-full rounded cyber-punk:border solid:border backdrop-blur"
	>
		{@render children()}
	</div>
</main>
