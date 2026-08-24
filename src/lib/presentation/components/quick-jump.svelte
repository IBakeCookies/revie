<script lang="ts">
	import type { PageEntry, ServiceLink } from '$lib/business/model/config';
	import { m } from '$lib/paraglide/messages';

	export type Props = {
		/** Every configured page, as the load returned it. */
		pages: PageEntry[];
		/**
		 * The services on THIS page, as the load returned them. Pages come first in
		 * the list, config order within each half — the palette answers "where can I
		 * go", and a page is the bigger jump than a tile already on screen.
		 */
		services: ServiceLink[];
		/**
		 * Bindable, so a story can hold the dialog OPEN — the one state axe has to
		 * see rendered, since it only ever audits a story's rest state. Everything
		 * else opens it through the shortcut below.
		 */
		open?: boolean;
	};

	let { pages, services, open = $bindable(false) }: Props = $props();

	let panel = $state<HTMLDialogElement>();
	let field = $state<HTMLInputElement>();

	let query = $state('');

	/**
	 * Where focus came from. Native close() only restores focus when something had
	 * it before `showModal` — opened from a bare page, which is the shortcut's
	 * usual case, Chromium keeps focus on the closed dialog's field instead
	 * (measured). Captured here, so every closer hands focus back.
	 */
	let returnFocusTo: HTMLElement | null = null;

	type Jump = {
		label: string;
		href: string;
		/**
		 * A service leaves the dashboard for another host, so it opens a new tab —
		 * the same reason a service tile carries `target`/`rel`.
		 */
		external: boolean;
	};

	const jumps = $derived<Jump[]>([
		...pages.map((page) => ({
			label: page.name,
			href: page.path,
			external: false,
		})),
		...services.map((service) => ({
			label: service.title,
			href: service.href,
			external: true,
		})),
	]);

	// Substring over label and href, case-folded: typing a hostname finds the box
	// whose title says nothing about it. Deliberately no fuzzy matching — the whole
	// candidate set is one operator's config, and every entry is already on the page.
	const matches = $derived.by(() => {
		const needle = query.trim().toLowerCase();

		if (!needle) {
			return jumps;
		}

		return jumps.filter(
			(jump) =>
				jump.label.toLowerCase().includes(needle) || jump.href.toLowerCase().includes(needle),
		);
	});

	// One effect drives both directions, so every closer — the shortcut again,
	// Escape, a backdrop or a chosen row — ends in the same place. `showModal` is
	// what traps focus and makes the rest of the page inert; handing focus back is
	// ours (see restoreFocus), because the platform only does it for a real
	// previously-focused element and leaves it stranded on the hidden field
	// otherwise.
	$effect(() => {
		const dialog = panel;

		if (!dialog) {
			return;
		}

		if (open && !dialog.open) {
			// Fresh each time: reopening shows last time's query filtered to whatever
			// it had matched, which reads as a broken empty list.
			query = '';
			returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();

			restoreFocus();
		}
	});

	/**
	 * Hands focus back to wherever the palette found it. Deferred by one task,
	 * and that is not caution: Chromium swallows a `.focus()` issued in the same
	 * task as the `close()` that hid the field being left — measured — while a
	 * task later it lands. Nulled first, so the `close` event's own call below
	 * becomes a no-op whenever this path already ran; one restore per close.
	 */
	function restoreFocus(): void {
		const target = returnFocusTo;

		returnFocusTo = null;

		window.setTimeout(() => {
			target?.focus();

			// The fallback half, because the swallow above is not always cured by
			// waiting: where it is not, focus is still sitting on the field the
			// close just hid. Letting go is what matters for a keyboard user —
			// blur drops activeElement on the page instead of an invisible node.
			const stranded = document.activeElement;

			if (stranded instanceof HTMLElement && panel?.contains(stranded)) {
				stranded.blur();
			}
		});
	}

	// `/` is BoxSearch's; this palette takes the other convention, and
	// `preventDefault` is what stops the browser from moving focus to its own
	// address-bar search instead.
	function onShortcut(event: KeyboardEvent): void {
		if (event.key === 'k' && (event.ctrlKey || event.metaKey)) {
			event.preventDefault();

			open = !open;

			return;
		}

		// Escape closes — spelled out rather than left to the platform, because the
		// browser's own dialog close-watcher answers only real key presses, while
		// every synthetic keydown (test drivers among them) lands here instead.
		// Both paths end in the same `close` event below.
		if (open && event.key === 'Escape') {
			event.preventDefault();

			open = false;
		}
	}

	// Delegated, so both cases stay one handler: the backdrop (which lands on the
	// dialog element itself, the content wrapper covering everything inside it) and
	// any chosen row. Closing before the row navigates is load-bearing — jumping
	// between two config pages remounts nothing (one route, different params), so
	// an open dialog would otherwise survive the very jump it performed.
	function onClick(event: MouseEvent): void {
		if (event.target === panel) {
			panel?.close();

			return;
		}

		if (event.target instanceof Element && event.target.closest('a')) {
			panel?.close();
		}
	}

	function onFieldKeydown(event: KeyboardEvent): void {
		const first = panel?.querySelector('a');

		if (event.key === 'ArrowDown') {
			event.preventDefault();

			first?.focus();
		} else if (event.key === 'Enter') {
			event.preventDefault();

			// Enter opens the top match, like every palette. The click runs the
			// anchor's own behaviour, so pages navigate and services open a new tab
			// through the same attributes the pointer path uses — and the delegated
			// handler above closes the dialog for it.
			first?.click();
		}
	}

	// Arrows move DOM focus between the visible rows rather than maintaining a
	// selected index beside `aria-activedescendant`: focus is what screen readers,
	// the ring and Enter-on-a-link already agree on, so there is no second notion
	// of "current" to keep in step with the filtered list. Past either end lands
	// back on the field, so typing never costs more than one ArrowUp.
	function onRowKeydown(event: KeyboardEvent & { currentTarget: HTMLAnchorElement }): void {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
			return;
		}

		const dialog = panel;

		if (!dialog) {
			return;
		}

		event.preventDefault();

		const rows = [...dialog.querySelectorAll('a')];
		const at = rows.indexOf(event.currentTarget);

		if (event.key === 'ArrowUp') {
			(at === 0 ? field : rows[at - 1])?.focus();
		} else {
			rows[at + 1]?.focus();
		}
	}
</script>

<svelte:window onkeydown={onShortcut} />

<!-- A native modal dialog, so the semantics are the platform's: `showModal` traps
     focus, makes the page behind inert, turns Escape into close and returns focus
     on close. Centered explicitly rather than left to the UA stylesheet, so
     preflight cannot silently take the centering away.
     The display utilities are gated behind `open:`, and that is not decoration:
     the UA stylesheet hides a shut dialog with `dialog:not([open]) { display:
     none }`, but any author-origin display value beats it regardless of
     specificity — an ungated `flex` here shipped the panel permanently painted
     over the page. The same sheet gives <dialog> `color: canvastext`, which also
     beats inheritance and paints black under every theme; `text-ty-primary` is
     what hands the panel back to the tokens its children already assume. -->
<dialog
	bind:this={panel}
	onclose={() => {
		open = false;

		// Covers the native paths — a real user's Escape reaching the platform's
		// own close-watcher among them. A no-op when the effect above already
		// ran: `restoreFocus` nulls what it takes, one restore per close.
		restoreFocus();
	}}
	onclick={onClick}
	aria-label={m.quick_jump_label()}
	class="bg-popover border-line-strong shadow-card fixed left-1/2 top-1/2 open:flex max-h-[min(80vh,32rem)] w-[min(90vw,36rem)] -translate-x-1/2 -translate-y-1/2 open:flex-col rounded-xl border text-ty-primary"
>
	<!-- Unpadded dialog, padded wrapper: the backdrop is then the only thing whose
	     click lands on the dialog element itself, which is what onClick above tests. -->
	<div class="flex min-h-0 flex-col p-box-md">
		<!-- No `autofocus` here — and that is not tidiness: Svelte 5 implements the
		     attribute by calling `.focus()` in a post-mount microtask whenever body has
		     focus, which steals focus for a CLOSED dialog on every page load. Where
		     `showModal` puts focus is already decided by the platform's own dialog
		     focusing steps, and they pick this field: it is the dialog's first
		     focusable control. -->
		<input
			bind:this={field}
			bind:value={query}
			onkeydown={onFieldKeydown}
			type="text"
			placeholder={m.quick_jump_filter()}
			aria-label={m.quick_jump_filter()}
			class="bg-surface-inset border-line-strong focus-visible:ring-ring w-full shrink-0 rounded-md border px-box-sm py-text-2xs focus-visible:ring-2 focus-visible:outline-none"
		/>

		{#if matches.length > 0}
			<ul class="nice-scrollbar mt-text-xs min-h-0 flex-1 overflow-y-auto">
				{#each matches as jump (jump.external ? `service ${jump.href}` : `page ${jump.href}`)}
					<li>
						<a
							href={jump.href}
							target={jump.external ? '_blank' : undefined}
							rel={jump.external ? 'noreferrer' : undefined}
							onkeydown={onRowKeydown}
							class="hover:bg-surface-hover focus-visible:ring-ring mt-text-3xs flex items-baseline justify-between gap-text-sm rounded-md px-box-sm py-text-2xs text-sm focus-visible:ring-2 focus-visible:outline-none [&:first-child]:mt-0"
						>
							<span class="truncate">{jump.label}</span>
							<!-- Where it goes, not just what it is called: two tiles can share a
							     name, and the destination is what disambiguates a jump. -->
							<span class="text-ty-silent shrink-0 truncate text-2xs">{jump.href}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-ty-silent mt-text-xs px-box-sm text-sm">{m.quick_jump_no_matches()}</p>
		{/if}
	</div>
</dialog>
