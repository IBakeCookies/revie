<script lang="ts">
	import type { FeedItem } from '$lib/business/type/feed';
	import { cn, spanStyle } from '$lib/utils/style';
	import { m } from '$lib/paraglide/messages';

	/**
	 * Every prop this box takes, and nothing else — deliberately WITHOUT a
	 * `{...restProps}` pass-through, like every box since #22. No `href` here either,
	 * unlike its siblings: their boxes render the configured instance as one link,
	 * while this one renders N links out of the items, so the URL stays on the wrapper
	 * — where it is the store's lookup key — instead of arriving to sit unread.
	 */
	export type Props = {
		/** How many rows to show, over the default below. */
		limit?: number;
		items?: FeedItem[];
		span?: number;
	};

	let { limit, items, span }: Props = $props();

	/**
	 * What an operator sees without writing anything. Ten rows fills a start-page box
	 * without scrolling it out of the grid row it shares; `limit` exists for the feeds
	 * where that is wrong.
	 */
	const DEFAULT_LIMIT = 10;

	// Clamped rather than trusted: a hand-edited 0 or -3 would slice nothing (or
	// backwards) and read as an empty box — a broken feed, which is a different state
	// than "one row". A fractional one floors, for the same reason spans do not take 1.5.
	const shown = $derived((items ?? []).slice(0, Math.max(1, Math.floor(limit ?? DEFAULT_LIMIT))));
</script>

<!-- Reads `--box-surface` like every box: the container it sits in declares the fill,
     because the same BoxFeed is a tile inside a Grid card on one page and sits straight
     on the page on another, and one hardcoded fill would be wrong in whichever case it
     wasn't written for. -->
<div
	style={spanStyle(span)}
	class={cn(
		'bg-(--box-surface,var(--surface-card)) border-line-soft col-span-12 rounded-2xl border p-box-lg backdrop-blur xl:col-span-(--span)',
	)}
>
	{#if shown.length > 0}
		<!-- Newest first is what a feed IS, so the order the entries arrive in is the
		     order they render in. Keyed by index like the stats readings: links can
		     legitimately repeat across entries, and a duplicate key would be an
		     each_key_duplicate error about translated content we do not control. -->
		<ul class="divide-line-soft flex flex-col divide-y">
			{#each shown as item, index (index)}
				<li class="flex min-w-0 items-baseline py-text-2xs first:pt-0 last:pb-0">
					<a
						href={item.link}
						target="_blank"
						rel="noreferrer"
						class="text-ty-secondary hover:text-ty-primary focus-visible:text-ty-primary truncate transition-colors focus-visible:outline-none"
					>
						{item.title}
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<!-- Without this the box was a padded rectangle with nothing in it, which reads as
		     a layout bug rather than as a source that did not answer. Same shape as the
		     stats unavailable line: the dot carries the state and the box's own border
		     carries the edge, so no surface of its own around the sentence. -->
		<p class="text-ty-secondary flex items-center justify-center gap-text-xs">
			<span class="bg-danger size-2 shrink-0 rounded-full" aria-hidden="true"></span>
			{m.feed_unavailable()}
		</p>
	{/if}
</div>
