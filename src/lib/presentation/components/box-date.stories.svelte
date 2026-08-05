<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import BoxDate from '$lib/presentation/components/box-date.svelte';

	const { Story } = defineMeta({
		title: 'Components/Box Date',
		component: BoxDate,
		tags: ['autodocs'],
		args: {
			span: 4,
		},
	});
</script>

<!-- The clock box: a translucent surface, so it carries its own backdrop-blur -->
<Story
	name="Default span"
	play={async ({ canvasElement }) => {
		const box = canvasElement.querySelector('div');

		// `--span` must always be emitted: an unset custom property makes
		// `grid-column` invalid at computed-value time, which drops the declaration
		// and collapses the whole column rule.
		await expect(box).toHaveStyle({
			'--span': '4',
		});

		// Every translucent surface on the page needs the blur, or the theme's
		// background image shows through unfrosted next to the cards around it.
		await expect(box).toHaveClass('backdrop-blur');

		// Nothing declares --box-surface above a story, which is the top-level case:
		// the box takes the fallback and sits at card weight, the same as a Grid
		// beside it on the page. The computed value is the assertion and not just
		// the class, because the failure mode is silent — one typo inside the var()
		// makes the whole declaration invalid, and an invalid background computes to
		// transparent with no error in the build, the browser or the type checker.
		await expect(box).toHaveClass('bg-(--box-surface,var(--surface-card))');
		await expect(getComputedStyle(box!).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
	}}
/>

<!-- A formatted reading, not a raw Date: the box renders the locale's own order -->
<Story
	name="Renders a formatted date"
	play={async ({ canvas }) => {
		// Matches the Intl parts the formatter asks for — weekday, day, month, year
		// and a h:m:s clock — without pinning the locale's separators.
		await expect(canvas.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
		await expect(canvas.getByText(/\d{4}/)).toBeInTheDocument();
	}}
/>

<!-- `span` is a token (1-12) mapped to a custom property, never a class name:
     a class that only appears in runtime config produces no CSS at all. -->
<Story
	name="Full width"
	args={{
		span: 12,
	}}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('div')).toHaveStyle({
			'--span': '12',
		});
	}}
/>

<!-- No span: the property still has to be emitted, or the column rule dies -->
<Story
	name="Unset span"
	args={{
		span: undefined,
	}}
	play={async ({ canvasElement }) => {
		const box = canvasElement.querySelector('div');

		await expect(box).toHaveAttribute('style');
		await expect(box?.getAttribute('style')).toContain('--span');
	}}
/>
