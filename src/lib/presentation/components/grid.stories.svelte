<script module lang="ts">
	import type { ConfigContainer } from '$lib/business/model/config';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import icon from '$lib/presentation/assets/favicon.svg';
	import Grid from '$lib/presentation/components/grid.svelte';

	// The one container below with a heading of its own, so it is what shows which
	// level this card hands its tiles. It renders through a wrapper that reads the
	// services store, which the instance script sets.
	const tile: ConfigContainer[] = [
		{
			name: 'BoxService',
			props: {
				title: 'Jellyfin',
				href: 'http://jellyfin.local:8096',
				img: {
					src: icon,
				},
				span: 6,
			},
		},
	];

	// Two clocks rather than one service box: `BoxService` / `BoxStats` render
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

<script lang="ts">
	import { setServicesStore } from '$lib/business/store/service-store.svelte';

	// A service tile arrives as a wrapper that reads its probe result out of context,
	// so without a store there is no branch to render at all. The real store, empty:
	// that is the state a page is in before the first ping answers.
	setServicesStore();
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
		await expect(card).toHaveClass('bg-(--box-surface,var(--surface-card))');

		// h2 for the card's own title — the layout's app title is the page's only h1 —
		// and h3 for the label under it, which is a repeat of a tile title's level and
		// so never a skip.
		await expect(
			canvas.getByRole('heading', {
				name: 'Services',
				level: 2,
			}),
		).toBeInTheDocument();

		await expect(
			canvas.getByRole('heading', {
				name: 'All of them',
				level: 3,
			}),
		).toBeInTheDocument();

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

<!-- No headings of its own: the config named neither, so neither element exists —
     and a tile inside it has nothing to sit under. -->
<Story
	name="Untitled"
	args={{
		title: undefined,
		items: tile,
	}}
	play={async ({ canvas, canvasElement }) => {
		// The card drew no heading, so there is nothing between its tile and the
		// layout's h1: the tile stays h2 rather than skipping to h3. The level is the
		// card's to pass down, and it can only pass 3 once it has drawn one itself.
		// By role, not by tag: a tag-pinned selector keeps passing while silently
		// covering nothing the next time a heading level moves.
		await expect(canvas.getAllByRole('heading')).toHaveLength(1);

		await expect(
			canvas.getByRole('heading', {
				name: 'Jellyfin',
				level: 2,
			}),
		).toBeInTheDocument();

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
	play={async ({ canvas, canvasElement }) => {
		// h3, because both groups sit under THIS card's h2 title. A group draws no
		// title of its own, so the level of its label is the container's to choose —
		// top-level it is h2, and hardcoding h3 skipped a level on every page that
		// puts a group straight on it.
		await expect(
			canvas.getByRole('heading', {
				name: 'Smart Home',
				level: 3,
			}),
		).toBeInTheDocument();

		await expect(
			canvas.getByRole('heading', {
				name: 'Lights',
				level: 3,
			}),
		).toBeInTheDocument();

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

		// Two groups deep, and the box still reads the step this card declared: a
		// group draws no surface, so it passes --box-surface through rather than
		// stepping down again. Without the `inherit` each level would step down once
		// more, except there is no third token — so it would land back on the same
		// fill as its parent and the box would vanish into it on the opaque themes.
		const box = canvasElement.querySelector('time')?.closest('.col-span-12');

		await expect(getComputedStyle(box!).backgroundColor).toBe(
			getComputedStyle(document.documentElement).getPropertyValue('--surface-inset').trim(),
		);
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
