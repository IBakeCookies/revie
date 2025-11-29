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
</script>

{#if adguardStore && adguardStore.stats}
	<div
		{...restProps}
		class={cn(
			'@container/box-adguard col-span-12 rounded-xs bg-box-secondary p-box-md',
			restProps.class
		)}
	>
		<div class="grid gap-grid-md grid-cols-1 @2xl:grid-cols-2">
			<p
				class="@2xl/box-adguard:p-box-md p-box-xs rounded-xs bg-success text-success-foreground"
			>
				DNS Queries: {adguardStore.stats.dnsQueries}
			</p>

			<p
				class="@2xl/box-adguard:p-box-md p-box-xs rounded-xs bg-danger text-danger-foreground"
			>
				Blocked: {adguardStore.stats.numBlockedFiltering}
			</p>

			<p class="@2xl/box-adguard:p-box-md p-box-xs rounded-xs bg-info text-info-foreground">
				Delay: {adguardStore.stats.avgProcessingTime}ms
			</p>

			<p
				class="@2xl/box-adguard:p-box-md p-box-xs rounded-xs bg-warning text-warning-foreground"
			>
				Top Blocked Domain: {adguardStore.stats.topBlockedDomain}
			</p>
		</div>
	</div>
{/if}
