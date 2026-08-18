<script module lang="ts">
	import type { ConfigContainer as Container } from '$lib/business/model/config';
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import icon from '$lib/presentation/assets/favicon.svg';
	import ConfigContainer from '$lib/presentation/components/config-container.svelte';

	/* A name the schema does not declare, so the type has to be forced — which is the
	   point of the {:else} branch: `unhandled()` takes `never`, so the only way to
	   reach it is a container business declares and this component has no branch for,
	   and that state cannot be built from a valid value. */
	const unknownContainer = {
		name: 'NotAComponent',
		props: {},
	} as unknown as Container;

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
		await expect(grid).toHaveClass('bg-(--box-surface,var(--surface-card))');

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

<!-- SubGrid is Grid with its surface switched off and tighter gaps, which is all
     that separates the two branches. It relies on `cn()` recognising p-* / gap-grid-*
     as conflicts — if the @theme spacing scale and extendTailwindMerge drift, both
     survive and the group silently keeps the outer card's padding. -->
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
	play={async ({ canvas, canvasElement }) => {
		const subGrid = canvasElement.querySelector('div');

		// The padding is a left rail now, so Grid's own p-box-xl has to lose to `p-0`.
		await expect(subGrid).toHaveClass('pl-box-md');
		await expect(subGrid).not.toHaveClass('p-box-xl');

		// `title` is set in the args above and must not render: SubGrid overrides it
		// after the spread, so a config that names one gets no h2 and no hairline.
		await expect(canvas.queryByRole('heading')).not.toBeInTheDocument();

		// A group draws no surface of its own — with Grid's fill and blur still on, a
		// SubGrid was a second card inside the card it sits in. The COMPUTED fill is
		// the assertion: `bg-transparent` has to win the cn() merge against Grid's
		// `bg-(--box-surface,var(--surface-card))`, and a class check passes happily
		// while both survive.
		await expect(getComputedStyle(subGrid!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		await expect(subGrid).not.toHaveClass('backdrop-blur');

		const inner = subGrid?.querySelector('.grid');

		await expect(inner).toHaveClass('gap-grid-sm');
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
					src: icon,
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

		await expect(dot).toHaveClass('bg-ty-ghost');
		await expect(dot).not.toHaveClass('bg-success');
	}}
/>

<!-- BoxStats' readings come from the SSR payload via a store, which no story mounts: the
     box has to render its shell on `undefined` rather than throw, because the page load
     hands back an error as a value whenever the service is unreachable.

     `secret` rides along in the container's props because a real config carries it, and the
     box declares no such prop: the spread has to survive a key nothing downstream names.
     Whether it reaches the DOM is the e2e's assertion, not this one. -->
<Story
	name="Box stats without stats"
	args={{
		container: {
			name: 'BoxStats',
			props: {
				provider: 'adguard',
				href: 'http://adguard.local',
				secret: 'ADGUARD_MAIN',
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

		// No stats, so one line saying so instead of the readings.
		await expect(link?.querySelectorAll('p')).toHaveLength(1);
	}}
/>

<!-- The one container that is a form rather than a link: the branch has to hand config's
     own props to it, `href` among them, or the box submits to the page it sits on. -->
<Story
	name="Box search"
	args={{
		container: {
			name: 'BoxSearch',
			props: {
				href: 'http://whoogle.local:5000/search',
				placeholder: 'Search the web',
				span: 6,
			},
		},
	}}
	play={async ({ canvasElement }) => {
		const form = canvasElement.querySelector('form');

		await expect(form).toHaveAttribute('action', 'http://whoogle.local:5000/search');
	}}
/>

<!-- The {:else}: business declared a container this component has no branch for. It
     is a compile error to reach it honestly, so the story forces the type — and it
     is its own story rather than a step in a play function because axe only ever
     sees a story's rest state, and this is a state a reader can land on. -->
<Story
	name="Unhandled container"
	args={{
		container: unknownContainer,
	}}
	play={async ({ canvas, canvasElement }) => {
		// Names the container rather than rendering nothing: a hole in the grid gives
		// whoever edited config.json nothing to search for.
		await expect(canvas.getByText('No renderer for container "NotAComponent"')).toBeVisible();

		await expect(canvasElement.querySelector('p')).toHaveClass('border-danger');
	}}
/>
