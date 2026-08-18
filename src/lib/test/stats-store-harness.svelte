<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Stat } from '$lib/business/type/stats';
	import { setStatsStore } from '$lib/business/store/stats-store.svelte';

	type Props = {
		/** Keyed exactly as the load keys it — `statsKey(provider, href)`. */
		stats: Record<string, Stat[]>;
		children: Snippet;
	};

	let { stats, children }: Props = $props();

	/* Story support: `setContext` needs a component being initialised, so a story that
	   wants its OWN store has to mount one of these rather than call the setter from the
	   stories file — where a single context would be shared by every story on the
	   autodocs page, and the last play function to run would decide what all of them
	   show. The store takes a THUNK, so flipping `stats` on a mounted harness still
	   propagates. */
	setStatsStore(() => stats);
</script>

{@render children()}
