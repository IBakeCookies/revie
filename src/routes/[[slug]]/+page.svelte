<script lang="ts">
	import type { PageProps } from './$types';
	import Page from '$lib/presentation/components/page.svelte';

	let { data }: PageProps = $props();
</script>

<Page adguard={data.adguard} containers={data.containers} />
