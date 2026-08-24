<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import QuickJump from '$lib/presentation/components/quick-jump.svelte';
	import { m } from '$lib/paraglide/messages';

	const { Story } = defineMeta({
		title: 'Components/Quick Jump',
		component: QuickJump,
		tags: ['autodocs'],
		args: {
			pages: [
				{
					path: '/',
					name: 'Home',
				},
				{
					path: '/media/plex',
					name: 'Plex',
				},
			],
			services: [
				{
					title: 'Proxmox',
					href: 'https://proxmox.local:8006',
				},
				{
					title: 'Plex',
					href: 'http://plex.local:32400',
				},
			],
		},
	});

	function panelOf(canvasElement: HTMLElement): HTMLDialogElement {
		return canvasElement.querySelector('dialog')!;
	}

	/**
	 * Every play that opened the palette closes it again before finishing. A modal
	 * left in the top layer outlives its story inside the shared canvas, and the
	 * next story's own `showModal` then stacks on it — nothing here needs that.
	 */
	function closePanel(canvasElement: HTMLElement): void {
		panelOf(canvasElement).close();
	}
</script>

<!-- Rest state: the dialog is in the DOM but shut, so nothing of it is reachable —
     which is only honest because a closed native dialog is display:none. An UNGATED
     display utility on the <dialog> itself is author CSS and beats that UA rule
     regardless of specificity, which shipped the panel permanently painted over the
     page — the visibility assertion below is the fence for exactly that. -->
<Story
	name="Closed"
	play={async ({ canvasElement }) => {
		const panel = panelOf(canvasElement);

		await expect(panel.open).toBe(false);
		await expect(panel).not.toBeVisible();
	}}
/>

<!-- Held OPEN as its own rest state, because axe audits rest states only and an open
     modal is exactly the state worth auditing: the label, the labelled field and the
     named rows all exist here. `showModal` runs from the bound prop, the same path
     the shortcut takes. -->
<Story
	name="Open"
	args={{
		open: true,
	}}
	play={async ({ canvasElement }) => {
		const panel = panelOf(canvasElement);

		await expect(panel.open).toBe(true);

		// From the catalogue, never a literal — same fence as box-search's label.
		await expect(panel).toHaveAccessibleName(m.quick_jump_label());

		// `showModal` puts focus on the dialog's first focusable control — this
		// field. (No `autofocus` in the component: Svelte 5 implements it by
		// focusing post-mount, which would steal focus for a CLOSED dialog.)
		await expect(canvasElement.querySelector('input')!).toHaveFocus();

		// Everything the palette offers, pages first: two rows per kind, each naming
		// what it is called AND where it goes. Whitespace between the two spans is
		// layout, so the match tolerates it.
		const links = canvasElement.querySelectorAll('a');

		await expect(links.length).toBe(4);
		await expect(links[0]).toHaveTextContent(/Home\s+\/$/);
		await expect(links[3]).toHaveTextContent(/Plex\s+http:\/\/plex\.local:32400$/);

		closePanel(canvasElement);
	}}
/>

<!-- The trigger. `/` belongs to BoxSearch, so this palette takes Ctrl/Cmd+K — and
     `preventDefault` matters as much here as there: without it the browser moves
     focus to its own address-bar search instead. Escape closes, and the palette
     hands focus back to wherever it was before the dialog took it — one task
     later, because Chromium drops a `.focus()` issued in the same task as the
     `close()` that hid the field being left. -->
<Story
	name="Opens on ctrl+k and escapes closed"
	play={async ({ canvasElement, userEvent }) => {
		await userEvent.keyboard('{Control>}k{/Control}');

		const panel = panelOf(canvasElement);

		await expect(panel.open).toBe(true);
		await expect(canvasElement.querySelector('input')!).toHaveFocus();

		await userEvent.keyboard('{Escape}');

		await expect(panel.open).toBe(false);

		// The restore is deferred past the close task (see restoreFocus), so this
		// waits for it rather than racing it.
		await waitFor(() => expect(document.activeElement).toBe(document.body));
	}}
/>

<!-- Substring over title and href, case-folded: typing a hostname finds the box
     whose title says nothing about it. Zero matches says so rather than rendering
     an empty list that reads as a broken one. -->
<Story
	name="Filters as you type"
	play={async ({ canvasElement, userEvent }) => {
		await userEvent.keyboard('{Control>}k{/Control}');

		const field = canvasElement.querySelector('input')!;

		await userEvent.type(field, 'PLEX');

		let links = canvasElement.querySelectorAll('a');

		// Case-folded, and both halves match: the Plex page by name, the Plex tile
		// by title — Proxmox carries neither needle and is gone.
		await expect(links.length).toBe(2);
		await expect(links[0].textContent).toContain('Plex');
		await expect(links[1].textContent).toContain('Plex');

		await userEvent.clear(field);
		await userEvent.type(field, 'zzz');

		await expect(canvasElement.querySelectorAll('a').length).toBe(0);
		await expect(canvasElement.textContent).toContain(m.quick_jump_no_matches());

		closePanel(canvasElement);
	}}
/>

<!-- A service leaves the dashboard for another host, so it opens a new tab and
     leaves no Referer behind — the same pair of attributes a service tile carries.
     A page stays an internal navigation, so it carries neither. -->
<Story
	name="Marks services external"
	args={{
		open: true,
	}}
	play={async ({ canvasElement }) => {
		const links = [...canvasElement.querySelectorAll('a')];

		await expect(links.find((link) => link.textContent!.includes('Proxmox'))).toHaveAttribute(
			'target',
			'_blank',
		);

		await expect(links.find((link) => link.textContent!.includes('Proxmox'))).toHaveAttribute(
			'rel',
			'noreferrer',
		);

		await expect(links.find((link) => link.textContent!.includes('Home'))).not.toHaveAttribute(
			'target',
		);

		closePanel(canvasElement);
	}}
/>

<!-- Arrows move FOCUS, not a shadow index beside aria-activedescendant: focus is the
     one thing the ring, screen readers and Enter-on-a-link already agree on. Past
     either end lands back on the field, so returning to typing costs one ArrowUp. -->
<Story
	name="Arrows move focus"
	play={async ({ canvasElement, userEvent }) => {
		await userEvent.keyboard('{Control>}k{/Control}');

		const field = canvasElement.querySelector('input')!;
		const rows = () => [...canvasElement.querySelectorAll('a')];

		await expect(field).toHaveFocus();

		await userEvent.keyboard('{ArrowDown}');
		await expect(rows()[0]).toHaveFocus();

		await userEvent.keyboard('{ArrowDown}');
		await expect(rows()[1]).toHaveFocus();

		await userEvent.keyboard('{ArrowUp}');
		await expect(rows()[0]).toHaveFocus();

		await userEvent.keyboard('{ArrowUp}');
		await expect(field).toHaveFocus();

		closePanel(canvasElement);
	}}
/>

<!-- Enter from the field opens the TOP match through the anchor's own click, so the
     pointer and keyboard paths share one behaviour. The single entry is an EXTERNAL
     service on purpose: its activation is a new-tab navigation, which never touches
     this document. An internal entry is not safe here — even a FRAGMENT activation
     fires a hashchange the storybook canvas answers by replacing the page, which
     took the whole file down.
     The closed panel IS the activation proof: the only thing binding Enter to
     closing is first.click() running the delegated handler, so a dialog that shut
     here was shut by a genuinely fired row. -->
<Story
	name="Enter opens the top match"
	args={{
		pages: [],
		services: [
			{
				title: 'Only',
				href: 'https://only.local:9000',
			},
		],
	}}
	play={async ({ canvasElement, userEvent }) => {
		await userEvent.keyboard('{Control>}k{/Control}');

		await userEvent.keyboard('{Enter}');

		// Closed by the delegated handler before the row goes anywhere: jumping
		// between two config pages remounts nothing, so an open dialog would
		// otherwise survive the jump it just performed.
		await expect(panelOf(canvasElement).open).toBe(false);

		closePanel(canvasElement);
	}}
/>

<!-- Choosing any row closes before it navigates, and that is load-bearing: jumping
     between two config pages remounts nothing (one route, different params), so an
     open dialog would survive the very jump it performed. The click is DISPATCHED —
     untrusted — and the one entry is an external service, so neither the dispatch
     nor anything replaying it can replace this document; see the Enter story above
     for what an internal href cost. -->
<Story
	name="A chosen row closes the palette"
	args={{
		pages: [],
		services: [
			{
				title: 'Only',
				href: 'https://only.local:9000',
			},
		],
	}}
	play={async ({ canvasElement }) => {
		const panel = panelOf(canvasElement);

		panel.showModal();

		const first = canvasElement.querySelector('a')!;

		first.dispatchEvent(
			new MouseEvent('click', {
				bubbles: true,
			}),
		);

		await expect(panel.open).toBe(false);

		closePanel(canvasElement);
	}}
/>
