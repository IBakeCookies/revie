<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import BoxNote from '$lib/presentation/components/box-note.svelte';

	const { Story } = defineMeta({
		title: 'Components/Box Note',
		component: BoxNote,
		tags: ['autodocs'],
		args: {
			text: 'Trash collection on Thursdays.\nWi-Fi: **see the router sticker**.',
			span: 6,
		},
	});
</script>

<!-- The whole box is one text node, so its contract IS its markup: what the config
     carries is what renders. No server half exists to test. -->
<Story
	name="Default span"
	play={async ({ canvasElement }) => {
		const note = canvasElement.querySelector('div');

		// Verbatim, asterisks included — a `**bold**` that renders bold would mean a
		// renderer and an HTML-sanitizing surface behind operator content, for nothing
		// the box promised. The matcher normalizes whitespace, so the newline is
		// asserted against the raw text node below rather than through it.
		await expect(note).toHaveTextContent('Trash collection on Thursdays.');
		await expect(note).toHaveTextContent('Wi-Fi: **see the router sticker**.');
		expect(note?.textContent).toContain('\n');

		// Line breaks preserved: without it two lines render as one run of text and
		// the config's newlines go silently invisible.
		await expect(note).toHaveClass('whitespace-pre-line');

		// `--span` must always be emitted: an unset custom property makes `grid-column`
		// invalid at computed-value time, which drops the declaration.
		await expect(note).toHaveStyle({
			'--span': '6',
		});

		// It draws a surface, so it reads the container's fill and frosts the scenery
		// behind it. The computed value is the assertion and not just the class, because
		// one typo inside the var() makes the declaration invalid — and an invalid
		// background computes to transparent with no error anywhere.
		await expect(note).toHaveClass('bg-(--box-surface,var(--surface-card))');
		await expect(note).toHaveClass('backdrop-blur');
		await expect(getComputedStyle(note!).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

		// A body, not a section: no heading exists to skip a level under the Grid above.
		expect(canvasElement.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
	}}
/>

<!-- No span: the property still has to be emitted, or the column rule dies -->
<Story
	name="Unset span"
	args={{
		span: undefined,
	}}
	play={async ({ canvasElement }) => {
		// The VALUE, not just the property: `spanStyle()` falls back to the full twelve,
		// and a smaller default collapses every unset box to a sliver of a row while an
		// assertion that only looks for `--span` stays green.
		await expect(canvasElement.querySelector('div')).toHaveStyle({
			'--span': '12',
		});
	}}
/>
