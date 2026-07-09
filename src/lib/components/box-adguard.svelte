<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn } from '$lib/utils/style';
	import { getAdguardStore } from '$lib/store/adguard-store.svelte';

	type Props = {
		href: string;
		username?: string;
		password?: string;
		class?: ClassValue;
	} & HTMLAttributes<any>;

	let { username, password, ...restProps }: Props = $props();
	const adguardStore = getAdguardStore();

	const adguardDataMap = $derived.by(()=> {
		return adguardStore && adguardStore.stats ? [
				{
					text: `DNS Queries: ${adguardStore.stats.dnsQueries}`,
					class: 'border-success'
				}, 
				{
					text: `Blocked: ${adguardStore.stats.numBlockedFiltering}`,
					class: 'border-danger'
				}, 
				{
					text: `Delay: ${adguardStore.stats.avgProcessingTime}ms`,
					class: 'border-info'
				}, 
				{
					text: `Top Blocked Domain: ${adguardStore.stats.topBlockedDomain}`,
					class: 'border-warning'
				}, 
			] : [];
	})
</script>

<div
	{...restProps}
	class={cn(
		'@container/box-adguard col-span-12 rounded-xs bg-box-secondary p-box-md',
		restProps.class
	)}
>
	<div class="grid gap-grid-xs grid-cols-1 @2xl:grid-cols-2">
		{#each adguardDataMap as item}
			<p
				class={["@2xl/box-adguard:p-box-md bg-box-primary p-box-xs rounded-xs border", item.class]}
			>
				{item.text}
			</p>
		{/each}
		
	</div>
</div>
