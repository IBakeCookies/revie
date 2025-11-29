<script lang="ts">
	import Page from '$lib/components/page.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<Page adguard={data.adguard} config={data.config} />
