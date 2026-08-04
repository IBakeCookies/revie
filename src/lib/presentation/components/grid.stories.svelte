<script module lang="ts">
	import type { ConfigContainer } from '$lib/business/model/config';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import Grid from '$lib/presentation/components/grid.svelte';

	// Two clocks rather than one service box: `BoxService` / `BoxAdguard` render
	// through a wrapper that reads a store, and a story mounts no page to set one.
	const boxes: ConfigContainer[] = [
		{
			name: 'BoxDate',
			props: {
				span: 6,
			},
		},
		{
			name: 'BoxDate',
			props: {
				span: 6,
			},
		},
	];

	const nested: ConfigContainer[] = [
		{
			name: 'SubGrid',
			props: {
				subTitle: 'Smart Home',
				items: [
					{
						name: 'SubGrid',
						props: {
							subTitle: 'Lights',
							items: [
								{
									name: 'BoxDate',
									props: {
										span: 4,
									},
								},
							],
						},
					},
				],
			},
		},
	];

	const { Story } = defineMeta({
		title: 'Components/Grid',
		component: Grid,
		tags: ['autodocs'],
		args: {
			title: 'Services',
			items: boxes,
			span: 8,
		},
	});
</script>

<!-- The card every other container sits in: translucent, so it carries the blur -->
<Story
	name="A grid of boxes"
	args={{
		subTitle: 'All of them',
	}}
	play={async ({ canvas, canvasElement }) => {
		const card = canvasElement.querySelector('div');

		// `--span` must always be emitted: an unset custom property makes
		// `grid-column` invalid at computed-value time, which drops the declaration.
		await expect(card).toHaveStyle({
			'--span': '8',
		});

		await expect(card).toHaveClass('backdrop-blur');
		await expect(card).toHaveClass('bg-surface-card');

		await expect(canvas.getByText('Services')).toBeInTheDocument();
		await expect(canvas.getByText('All of them')).toBeInTheDocument();

		// Each child is rendered through config-container, so two descriptors mean
		// two boxes — the recursion is what config.json's render tree is made of.
		await expect(canvasElement.querySelectorAll('.grid > div')).toHaveLength(2);
	}}
/>

<!-- `items` is defaulted to [] during normalization on purpose, so a grid written
     before its children renders empty instead of throwing in the traversal. -->
<Story
	name="Empty grid"
	args={{
		items: [],
	}}
	play={async ({ canvas, canvasElement }) => {
		// Mounting at all is half the assertion: the storybook project fails a story
		// whose component throws on mount.
		await expect(canvas.getByText('Services')).toBeInTheDocument();

		const inner = canvasElement.querySelector('.grid');

		await expect(inner).toBeInTheDocument();
		await expect(inner?.childElementCount).toBe(0);
	}}
/>

<!-- No headings at all: the config named neither, so neither element exists -->
<Story
	name="Untitled"
	args={{
		title: undefined,
		items: [],
	}}
	play={async ({ canvas, canvasElement }) => {
		// By role, not by tag: a tag-pinned selector keeps passing while silently
		// covering nothing the next time a heading level moves.
		await expect(canvas.queryAllByRole('heading')).toHaveLength(0);

		// The wrapper holding the headings carries the gap below them, so it must not
		// render either — a grid given neither used to start with a blank strip.
		await expect(canvasElement.querySelector('div')?.firstElementChild).toHaveClass('grid');
	}}
/>

<!-- A grid inside a grid inside a grid: SubGrid IS this component with a tighter
     class, which is why the cycle config-container ↔ grid ↔ sub-grid is deliberate. -->
<Story
	name="Nested sub-grid"
	args={{
		items: nested,
	}}
	play={async ({ canvas }) => {
		await expect(canvas.getByText('Smart Home')).toBeInTheDocument();
		await expect(canvas.getByText('Lights')).toBeInTheDocument();

		// The headings live in their own wrapper now, so reach the sub-grid root by the
		// column class every Grid carries rather than by counting hops.
		const subGrid = canvas.getByText('Smart Home').closest('.col-span-12');

		// SubGrid's own spacing has to WIN the cn() merge — otherwise every nesting
		// level is spaced like a top-level card and the tree loses its hierarchy.
		await expect(subGrid).toHaveClass('pl-box-md');
		await expect(subGrid).not.toHaveClass('p-box-xl');

		// A nested group draws no card of its own, so nothing is left to blur.
		await expect(subGrid).toHaveClass('bg-transparent');
		await expect(subGrid).toHaveClass('backdrop-blur-none');
	}}
/>

<!-- No span: the property is still emitted, at the full twelve columns -->
<Story
	name="Unset span"
	args={{
		span: undefined,
		items: [],
	}}
	play={async ({ canvasElement }) => {
		await expect(canvasElement.querySelector('div')).toHaveStyle({
			'--span': '12',
		});
	}}
/>
