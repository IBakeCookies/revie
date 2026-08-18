<script lang="ts">
	import type { ClassValue } from 'clsx';
	import type { ProbeMode } from '$lib/business/model/config';
	import { cn, spanStyle } from '$lib/utils/style';
	import { m } from '$lib/paraglide/messages';

	export type Props = {
		title: string;
		href: string;
		img: {
			src: string;
		};
		isOnline?: boolean | null;
		/**
		 * Whether this tile has a state worth drawing. `none` is a bookmark — a link with
		 * nothing to measure — so it shows no dot and no status word rather than a
		 * permanent "unknown", which would assert a pending measurement that never comes.
		 * The same value keeps the href out of the poll and out of the ping allowlist
		 * upstream; this half is only what the tile renders.
		 */
		probe?: ProbeMode;
		/**
		 * Which level the title takes, chosen by whatever renders the tile — like the
		 * fill, a tile cannot know its own. The layout's app title is the page's only
		 * h1, so a tile sitting straight on the page is h2 or it skips a level; inside a
		 * Grid card it sits under that card's h2 and is h3. Size is a class, so the two
		 * render identically.
		 */
		headingLevel?: 2 | 3;
		span?: number;
		class?: ClassValue;
	};

	let {
		isOnline = null,
		probe = 'tcp',
		title,
		href,
		img,
		headingLevel = 2,
		span,
		class: className,
	}: Props = $props();

	const statusLabel = $derived(
		isOnline === null
			? m.service_status_unknown()
			: isOnline
				? m.service_status_online()
				: m.service_status_offline(),
	);

	// Which machine a tile points at is the second thing an operator wants after the
	// name. Guarded, not caught: a hand-edited href with no scheme makes `new URL`
	// throw, normalizeConfig only checks that the prop is a string, and this renders
	// during SSR — so one bad line of config would 500 the whole page. `canParse`
	// rather than the tidier `URL.parse`, because that one landed in node 22.1 and
	// `engines.node` is `>=22`.
	const host = $derived(URL.canParse(href) ? new URL(href).host : href);

	// A dashboard on a LAN reaches the icon CDNs config.example.json points at only
	// if the box has a route out, and a wrong path is a typo away. Either way the
	// browser draws its broken-image glyph, which reads as a rendering fault rather
	// than a missing icon — so fall back to the service's initial.
	//
	// The failure is recorded per src, not as a boolean: containers are keyed by
	// index, so navigating between two pages whose tile N differs reuses this
	// instance, and a plain flag would keep the letter over the next tile's good icon.
	let failedSrc = $state<string | undefined>();
	const hasIcon = $derived(failedSrc !== img.src);

	// `onerror` only catches what fails after hydration. An icon the SSR'd markup
	// already asked for fails while the bundle is still loading, and the event is not
	// replayed once the handler is attached — so the broken-image glyph stayed up on
	// exactly the load that matters most. A finished image with no intrinsic width is
	// one that failed, which is the only signal available after the fact.
	let icon = $state<HTMLImageElement | undefined>();

	$effect(() => {
		const { src } = img;

		if (icon?.complete && icon.naturalWidth === 0) {
			failedSrc = src;
		}
	});
</script>

<a
	{href}
	target="_blank"
	rel="noreferrer"
	style={spanStyle(span)}
	class={cn(
		'@container/box-service bg-(--box-surface,var(--surface-card)) border-line-soft hover:border-line-strong hover:bg-surface-hover hover:shadow-card focus-visible:ring-ring col-span-12 flex cursor-pointer items-center gap-text-sm rounded-xl border p-box-sm backdrop-blur transition focus-visible:ring-2 focus-visible:outline-none motion-safe:hover:-translate-y-0.5 xl:col-span-(--span)',
		className,
	)}
>
	<!-- No border of its own: a bordered plate inside a bordered tile, thirteen times
	     over, is a page of nested boxes. The fill is what seats it, and it has to be a
	     step below the tile — which `surface-card` only was while the tile was nested:
	     top-level the tile IS card, so the plate was the tile's own fill and vanished.
	     `surface-inset` is the ladder's deepest step, so it is one below a top-level
	     tile and, under a nested tile that is already inset, composites a step lighter
	     over itself the way box-stats' readings do. Named rather than read from
	     `--box-surface`: that property carries the TILE's fill, so reading it would
	     hand the plate the surface it is meant to sit on. -->
	<span
		class="bg-surface-inset grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg"
	>
		{#if hasIcon}
			<img
				bind:this={icon}
				class="size-6 object-contain"
				src={img.src}
				alt=""
				onerror={() => (failedSrc = img.src)}
			/>
		{:else}
			<span class="text-ty-secondary text-sm font-semibold" aria-hidden="true">
				{title.trim().charAt(0).toUpperCase()}
			</span>
		{/if}
	</span>

	<div class="flex min-w-0 flex-col">
		<svelte:element this={`h${headingLevel}`} class="truncate font-semibold">{title}</svelte:element
		>
		<span class="text-ty-silent truncate text-2xs">{host}</span>
	</div>

	<!-- Both marks go, not just the dot: a bookmark with the word alone would still be
	     claiming a state, and a bookmark with the dot alone puts colour back in sole
	     charge of the one fact the pair exists to carry. -->
	{#if probe !== 'none'}
		<!-- A tile is far wider than its name and host, so the state used to be a 10px dot
		     at the end of an empty half-tile — the one place on the row the eye is least
		     likely to be. The word fills that gap and says the state without colour;
		     `aria-hidden`, because the dot beside it is already announcing it once.
		     Container-queried rather than a viewport breakpoint: the same tile is a third of
		     a row here and a full phone width there, and only the tile knows which. -->
		<span
			class="text-ty-silent ml-auto hidden shrink-0 text-2xs tracking-wider uppercase @xs/box-service:block"
			aria-hidden="true"
		>
			{statusLabel}
		</span>

		<!-- `role="img"` is what makes the label count: `aria-label` is ignored on an
		     element with no role and no text, so without it the dot's state reached nobody
		     and colour was the only carrier.

		     Unknown is `ty-ghost`, not `primary`: a theme is free to make its accent the
		     same green as `success` — `revie` deliberately does — and then a service whose
		     probe has not answered yet reads as online to everyone not using the label.

		     The ring is a halo of the dot's own colour at 20%, not a second element: a 10px
		     disc is the smallest mark on the page and was carrying the one fact the page
		     exists to show. `ring` draws as a shadow, so the halo costs no layout — and it
		     is why the transition is `transition` and not `transition-colors`, which does
		     not cover box-shadow. Every dot starts unknown and flips once its probe
		     answers, so without it a page settling in reads as a rank of things blinking.

		     The three states differ by SILHOUETTE as well as hue — filled disc, rotated
		     square, hollow outline — because colour alone is the whole of WCAG 1.4.1 and
		     `success` against `danger` is the pair a red-green reader cannot separate. It
		     has to be the dot that carries it: below `@xs` the word above is hidden, and
		     that narrow tile is exactly the case the defect is about. The radius therefore
		     moves into the branches — `rotate-45` on a `rounded-full` mark turns nothing. -->
		<span
			role="img"
			class={[
				'ml-auto size-2.5 shrink-0 ring-4 transition @xs/box-service:ml-text-2xs',
				isOnline === true
					? 'bg-success ring-success/20 rounded-full'
					: isOnline === false
						? 'bg-danger ring-danger/20 rotate-45 rounded-xs'
						: 'border-ty-ghost ring-ty-ghost/20 rounded-full border-2',
			]}
			aria-label={statusLabel}
		>
		</span>
	{/if}
</a>
