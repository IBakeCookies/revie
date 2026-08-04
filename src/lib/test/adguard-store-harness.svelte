<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { AdguardStats } from '$lib/business/type/adguard-stats';
	import { setAdguardStore } from '$lib/business/store/adguard-store.svelte';

	type Props = {
		stats?: AdguardStats;
		children: Snippet;
	};

	let { stats, children }: Props = $props();

	/* Story support: `setContext` needs a component being initialised, so a story that
	   wants its OWN store has to mount one of these rather than call the setter from the
	   stories file — where a single context would be shared by every story on the
	   autodocs page, and the last play function to run would decide what all of them
	   show. The store takes a THUNK, so flipping `stats` on a mounted harness still
	   propagates. */
	setAdguardStore(() => stats);
</script>

{@render children()}
