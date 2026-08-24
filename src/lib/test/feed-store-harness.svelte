<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { FeedItem } from '$lib/business/type/feed';
	import { setFeedStore } from '$lib/business/store/feed-store.svelte';

	type Props = {
		/** Keyed exactly as the load keys it — by feed href alone. */
		feeds: Record<string, FeedItem[]>;
		children: Snippet;
	};

	let { feeds, children }: Props = $props();

	/* Story support: `setContext` needs a component being initialised, so a story that
	   wants its OWN store has to mount one of these rather than call the setter from the
	   stories file — where a single context would be shared by every story on the
	   autodocs page, and the last play function to run would decide what all of them
	   show. The store takes a THUNK, so flipping `feeds` on a mounted harness still
	   propagates. */
	setFeedStore(() => feeds);
</script>

{@render children()}
