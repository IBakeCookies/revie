<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import BoxSearch from '$lib/presentation/components/box-search.svelte';
	import { m } from '$lib/paraglide/messages';

	const { Story } = defineMeta({
		title: 'Components/Box Search',
		component: BoxSearch,
		tags: ['autodocs'],
		args: {
			href: 'http://whoogle.local:5000/search',
			placeholder: 'Search the web',
			span: 6,
		},
	});
</script>

<!-- The whole box is one GET form, so its contract IS its markup: a plain `get` to the
     configured action with the query in `q`. No server half exists to test. -->
<Story
	name="Default span"
	play={async ({ canvas, canvasElement, args }) => {
		const form = canvasElement.querySelector('form');

		// `method` and `q` are the two halves an engine reads. `q` is hardcoded because
		// Whoogle, SearXNG, Google and DuckDuckGo all read it — a prop for it would be a
		// second caller that does not exist.
		await expect(form).toHaveAttribute('action', args.href);
		await expect(form).toHaveAttribute('method', 'get');

		// The dashboard's URL is an internal address, so it does not ride along to the engine.
		await expect(form).toHaveAttribute('rel', 'noreferrer');

		const field = canvas.getByRole('searchbox');

		await expect(field).toHaveAttribute('name', 'q');

		// From the catalogue, never a literal: a hardcoded string here is a second copy of
		// en.json that nothing forces to agree with it. Without a name the input sits in
		// the tab order announcing nothing, which is what axe's `label` rule is for.
		await expect(field).toHaveAccessibleName(m.search_label());
		await expect(field).toHaveAttribute('placeholder', args.placeholder);

		// `--span` must always be emitted: an unset custom property makes `grid-column`
		// invalid at computed-value time, which drops the declaration.
		await expect(form).toHaveStyle({
			'--span': '6',
		});

		// It draws a surface, so it reads the container's fill and frosts the scenery
		// behind it. The computed value is the assertion and not just the class, because
		// one typo inside the var() makes the declaration invalid — and an invalid
		// background computes to transparent with no error anywhere.
		await expect(form).toHaveClass('bg-(--box-surface,var(--surface-card))');
		await expect(form).toHaveClass('backdrop-blur');
		await expect(getComputedStyle(form!).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
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
		await expect(canvasElement.querySelector('form')).toHaveStyle({
			'--span': '12',
		});
	}}
/>

<!-- The shortcut, from the page rather than from the box: nothing is focused, so the
     keydown reaches `svelte:window`. -->
<Story
	name="Focuses on the slash key"
	play={async ({ canvas, userEvent }) => {
		await userEvent.keyboard('/');

		const field = canvas.getByRole('searchbox');

		await expect(field).toHaveFocus();

		// The `preventDefault` assertion: the character is inserted against whatever is
		// focused by the keypress stage, which is now this field — so without it the box
		// opens pre-filled with a slash.
		await expect(field).toHaveValue('');
	}}
/>

<!-- The other half of the shortcut: a key the user is typing is not the page's to take. -->
<Story
	name="Leaves another field alone"
	play={async ({ canvas, userEvent }) => {
		const other = canvas.getByRole('textbox');

		await userEvent.click(other);
		await userEvent.keyboard('/');

		await expect(other).toHaveValue('/');
		await expect(canvas.getByRole('searchbox')).not.toHaveFocus();
	}}
>
	{#snippet template(args)}
		<!-- Labelled, because axe runs against this story's rest state and a bare input
		     fails its `label` rule — which would read as a defect in the box beside it. -->
		<label>
			Other field
			<input />
		</label>

		<BoxSearch {...args} />
	{/snippet}
</Story>
