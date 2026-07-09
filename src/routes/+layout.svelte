<script lang="ts">
	import type { LayoutProps } from './$types';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { cn } from '$lib/utils/style';
	import { setThemeStore } from '$lib/store/theme-store.svelte';
	import Button from '$lib/components/button.svelte';
	import Dropdown from '$lib/components/dropdown.svelte';
	import Test from '$lib/components/test.svelte';


	let { children, data }: LayoutProps = $props();
	let sentinel = $state<HTMLElement | undefined>();
	let isNavAtTheTop = $state(false);

	const themeStore = setThemeStore(data.theme);
	const pages = Object.entries(data?.config?.pages || {}).map(([path, page]) => ({
		path,
		name: page.name || path
	}));


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
			'bg-box-primary flex-wrap p-box-xl w-full sticky top-0 z-10 rounded-b solid:border border-glass px-box-lg py-box-md max-w-screen-2xl mx-auto flex items-center glass-y',
			{
				'rounded-t': !isNavAtTheTop,
				'border-t-transparent': isNavAtTheTop
			}
		)}
	>
		<h1 class="font-bold text-2xl">Revie Dashboard</h1>

		{#each pages as page}
			<a
				href={page.path}
				class="ml-ty-list-md"
			>
				{page.name}
			</a>
		{/each}

		<div class="ml-auto flex items-center gap-ty-list-md">
			<Dropdown>
				{#snippet trigger()}
					Theme
				{/snippet}

				{#each themeStore.themes as theme}
					<button
						class={`py-ty-list-xs px-box-md cursor-pointer block ${themeStore.theme === theme.name ? '' : ''}`}
						onclick={() => themeStore.switchTheme(theme.name)}
					>
						{theme.name}
					</button>
				{/each}
			</Dropdown>
		</div>
	</header>

	<div
		class={`grid grid-cols-12 gap-grid-lg mt-grid-lg border-glass p-box-xl max-w-screen-2xl mx-auto w-full rounded solid:border ${data?.config?.layout?.gridClass}`}
	>
		{@render children()}
	</div>
</main>
