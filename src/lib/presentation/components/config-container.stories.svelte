<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import ConfigContainer from '$lib/presentation/components/config-container.svelte';

	const { Story } = defineMeta({
		title: 'Components/Config Container',
		component: ConfigContainer,
		tags: ['autodocs'],
		args: {
			container: {
				name: 'BoxDate',
				props: {
					span: 4,
				},
			},
		},
	});
</script>

<script lang="ts">
	import { setServicesStore } from '$lib/business/store/service-store.svelte';

	// BoxService arrives as a wrapper that reads the probe results out of context, so
	// without a store there is no branch to render at all. The real store is used
	// rather than a stub: empty is the state the page starts in before the first ping.
	setServicesStore();
</script>

<!-- Grid is the recursive branch: it renders children through this same component,
     so a child box appearing is what proves the chain reaches nested config. -->
<Story
	name="Grid"
	args={{
		container: {
			name: 'Grid',
			props: {
				title: 'Media',
				subTitle: 'Everything that streams',
				span: 12,
				items: [
					{
						name: 'BoxDate',
						props: {
							span: 6,
						},
					},
				],
			},
		},
	}}
	play={async ({ canvas, canvasElement }) => {
		const grid = canvasElement.querySelector('div');

		// `--span` must always be emitted: an unset custom property makes
		// `grid-column` invalid at computed-value time and drops the declaration.
		await expect(grid).toHaveStyle({
			'--span': '12',
		});

		// A card sitting on the page is translucent in all 27 themes, so the theme's
		// background image shows through unfrosted without the blur.
		await expect(grid).toHaveClass('backdrop-blur');
		await expect(grid).toHaveClass('bg-surface-card');

		await expect(
			canvas.getByRole('heading', {
				name: 'Media',
			}),
		).toBeVisible();

		// The nested BoxDate is rendered by a second pass through this component —
		// the clock is the evidence the recursion resolved the child's branch.
		await expect(canvas.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
	}}
/>

<!-- SubGrid is Grid with tighter spacing, and the only thing separating the two
     branches. It relies on `cn()` recognising p-box-* / gap-grid-* as conflicts —
     if the @theme spacing scale and extendTailwindMerge drift, both survive and
     the nested grid silently keeps the outer padding. -->
<Story
	name="Sub grid"
	args={{
		container: {
			name: 'SubGrid',
			props: {
				title: 'Downloads',
				span: 6,
				items: [],
			},
		},
	}}
	play={async ({ canvasElement }) => {
		const subGrid = canvasElement.querySelector('div');

		await expect(subGrid).toHaveClass('p-box-md');
		await expect(subGrid).not.toHaveClass('p-box-xl');

		const inner = subGrid?.querySelector('.grid');

		await expect(inner).toHaveClass('gap-grid-xs');
		await expect(inner).not.toHaveClass('gap-grid-lg');
	}}
/>

<!-- An `items`-less grid still renders: normalizeConfig sets `items` unconditionally
     so a grid written before its children is empty rather than a 500. -->
<Story
	name="Empty grid"
	args={{
		container: {
			name: 'Grid',
			props: {
				items: [],
			},
		},
	}}
	play={async ({ canvasElement }) => {
		const grid = canvasElement.querySelector('div');

		// No span in config, but the property is still emitted or the column rule dies.
		await expect(grid?.getAttribute('style')).toContain('--span');
		await expect(grid?.querySelector('.grid')?.children).toHaveLength(0);
	}}
/>

<!-- BoxDate takes nothing but `span`, which is what makes it the branch that proves
     the spread carries the common props and nothing else. -->
<Story
	name="Box date"
	play={async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelector('div')).toHaveStyle({
			'--span': '4',
		});

		await expect(canvas.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
	}}
/>

<!-- BoxService's branch renders a wrapper, so `href` does double duty: the link
     target and the key the store's probe result is looked up under. -->
<Story
	name="Box service"
	args={{
		container: {
			name: 'BoxService',
			props: {
				title: 'Jellyfin',
				href: 'http://jellyfin.local:8096',
				img: {
					src: '/favicon.png',
				},
				span: 3,
			},
		},
	}}
	play={async ({ canvas, canvasElement }) => {
		const link = canvasElement.querySelector('a');

		await expect(link).toHaveAttribute('href', 'http://jellyfin.local:8096');

		await expect(link).toHaveStyle({
			'--span': '3',
		});

		await expect(
			canvas.getByRole('heading', {
				name: 'Jellyfin',
			}),
		).toBeVisible();

		// Nothing has been probed yet, so `isAlive` is null — neither up nor down. A
		// green dot here would claim a service is reachable on no evidence.
		const dot = canvasElement.querySelector('span.rounded-full');

		await expect(dot).toHaveClass('bg-primary');
		await expect(dot).not.toHaveClass('bg-success');
	}}
/>

<!-- BoxAdguard's stats come from the SSR payload via a store, which no story mounts:
     the box has to render its shell on `undefined` rather than throw, because the
     page load hands back an error as a value whenever AdGuard is unreachable. -->
<Story
	name="Box adguard without stats"
	args={{
		container: {
			name: 'BoxAdguard',
			props: {
				href: 'http://adguard.local',
				span: 8,
			},
		},
	}}
	play={async ({ canvasElement }) => {
		const link = canvasElement.querySelector('a');

		await expect(link).toHaveAttribute('href', 'http://adguard.local');
		await expect(link).toHaveClass('backdrop-blur');

		await expect(link).toHaveStyle({
			'--span': '8',
		});

		// No stats, so one line saying so instead of the four readings.
		await expect(link?.querySelectorAll('p')).toHaveLength(1);
	}}
/>
