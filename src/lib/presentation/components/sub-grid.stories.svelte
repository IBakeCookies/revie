<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import SubGrid from '$lib/presentation/components/sub-grid.svelte';

	const { Story } = defineMeta({
		title: 'Components/Sub Grid',
		component: SubGrid,
		tags: ['autodocs'],
		args: {
			// `subTitle`, not `title`: SubGrid overrides `title` after the spread, so a
			// group label is the only heading it can draw.
			subTitle: 'Media',
			span: 6,
			items: [
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
			],
		},
	});
</script>

<!-- The nested half of the config-container ↔ grid ↔ sub-grid recursion: it is a
     Grid with its surface switched off, and every child arrives back through
     config-container rather than being named here. -->
<Story
	name="Nested boxes"
	play={async ({ canvas, canvasElement }) => {
		const box = canvasElement.querySelector('div');
		const inner = canvasElement.querySelector('.grid-cols-12');

		// h2, because a story mounts no card above this group: its label is then the
		// first thing under the layout's h1, and the hardcoded h3 it used to draw
		// skipped a level on every page that puts a group straight on it.
		await expect(
			canvas.getByRole('heading', {
				name: 'Media',
				level: 2,
			}),
		).toBeVisible();

		// Both children rendered, which is the only proof the recursion actually
		// reaches config-container instead of stopping at the wrapper.
		await expect(inner?.childElementCount).toBe(2);

		// The whole point of the component: a group is not a second card, so Grid's
		// fill and shadow have to lose the `cn()` merge. `shadow-card` only loses it
		// because `shadow: ['card']` is listed in extendTailwindMerge — unlisted,
		// tailwind-merge reads it as a shadow *colour*, both survive, and the
		// switch-off holds by CSS emission order alone.
		await expect(box).toHaveClass('bg-transparent');
		await expect(box).toHaveClass('shadow-none');
		await expect(box).not.toHaveClass('shadow-card');

		// Nothing to blur once there is no surface — and a blur here would make the
		// element a backdrop root, cutting the children off from the scenery.
		await expect(box).toHaveClass('backdrop-blur-none');
		await expect(box).not.toHaveClass('backdrop-blur');

		// What carries the grouping instead: a left rail, and padding on that side
		// only. Plus the tighter inner gap. This holds while the `@theme` spacing
		// scale stays mirrored in `extendTailwindMerge` — if they drift,
		// tailwind-merge stops seeing these as conflicts and keeps both.
		// Transparent on every side, then the rail colour back on the left one — the
		// `.not` is Grid's own all-sides border losing the merge.
		await expect(box).toHaveClass('border-transparent');
		await expect(box).toHaveClass('border-l-line-strong');
		await expect(box).not.toHaveClass('border-line-strong');
		await expect(box).toHaveClass('pl-box-md');
		await expect(box).not.toHaveClass('p-box-xl');
		await expect(inner).toHaveClass('gap-grid-sm');
		await expect(inner).not.toHaveClass('gap-grid-lg');
	}}
/>

<!-- A grid written before its children: normalizeConfig defaults `items` to []
     rather than dropping the container, so this state is reachable from a real
     config and must render empty, not throw. -->
<Story
	name="Empty"
	args={{
		subTitle: undefined,
		items: [],
	}}
	play={async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelector('.grid-cols-12')?.childElementCount).toBe(0);
		await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();

		// `--span` still has to be there: an unset custom property makes `grid-column`
		// invalid at computed-value time, which drops the whole column declaration.
		await expect(canvasElement.querySelector('div')).toHaveStyle({
			'--span': '6',
		});
	}}
/>

<!-- span is a token (1-12) mapped to a custom property, never a class name: a
     class that only appears in runtime config produces no CSS at all. -->
<Story
	name="Unset span"
	args={{
		span: undefined,
	}}
	play={async ({ canvasElement }) => {
		const box = canvasElement.querySelector('div');

		// Defaults to the full twelve, and the property is emitted either way.
		await expect(box).toHaveStyle({
			'--span': '12',
		});

		// `xl:col-span-(--span)` is the static utility that reads it; below xl the
		// nested grid is full width, so both classes have to survive the merge.
		await expect(box).toHaveClass('col-span-12');
		await expect(box).toHaveClass('xl:col-span-(--span)');
	}}
/>
