<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import SubGrid from '$lib/presentation/components/sub-grid.svelte';

	const { Story } = defineMeta({
		title: 'Components/Sub Grid',
		component: SubGrid,
		tags: ['autodocs'],
		args: {
			title: 'Media',
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
     Grid with tighter scenery, and every child arrives back through
     config-container rather than being named here. -->
<Story
	name="Nested boxes"
	play={async ({ canvas, canvasElement }) => {
		const box = canvasElement.querySelector('div');
		const inner = canvasElement.querySelector('.grid-cols-12');

		await expect(
			canvas.getByRole('heading', {
				name: 'Media',
			}),
		).toBeVisible();

		// Both children rendered, which is the only proof the recursion actually
		// reaches config-container instead of stopping at the wrapper.
		await expect(inner?.childElementCount).toBe(2);

		// The whole point of the component: it hands Grid a tighter padding, radius
		// and gap, and `cn()` has to let the later value win. This only holds while
		// the `@theme` spacing scale stays mirrored in `extendTailwindMerge` — if
		// they drift, tailwind-merge stops seeing these as conflicts and keeps both.
		await expect(box).toHaveClass('rounded-md');
		await expect(box).not.toHaveClass('rounded-2xl');
		await expect(box).toHaveClass('p-box-md');
		await expect(box).not.toHaveClass('p-box-xl');
		await expect(inner).toHaveClass('gap-grid-xs');
		await expect(inner).not.toHaveClass('gap-grid-lg');

		// `bg-surface-card` is translucent in all 27 themes, so the nested surface
		// needs its own blur — overriding the radius must not cost it Grid's.
		await expect(box).toHaveClass('backdrop-blur');
	}}
/>

<!-- A grid written before its children: normalizeConfig defaults `items` to []
     rather than dropping the container, so this state is reachable from a real
     config and must render as an empty surface, not throw. -->
<Story
	name="Empty"
	args={{
		title: undefined,
		items: [],
	}}
	play={async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelector('.grid-cols-12')?.childElementCount).toBe(0);
		await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();

		// The surface still has to be a surface, and `--span` still has to be there:
		// an unset custom property makes `grid-column` invalid at computed-value
		// time, which drops the whole column declaration.
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
