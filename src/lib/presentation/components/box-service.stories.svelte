<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, waitFor } from 'storybook/test';
	import icon from '$lib/presentation/assets/favicon.svg';
	import BoxService from '$lib/presentation/components/box-service.svelte';
	import { m } from '$lib/paraglide/messages';

	/* The app's own icon, imported rather than spelled as a path: vite inlines it as a
	   data URI, so every story that wants a LOADED icon gets one with no fetch to wait
	   on. `/favicon.svg` used to sit here and 404, which put these stories in the
	   letter-fallback state that "Icon unavailable" below exists to show. */
	const { Story } = defineMeta({
		title: 'Components/Box Service',
		component: BoxService,
		tags: ['autodocs'],
		args: {
			title: 'Proxmox',
			href: 'https://proxmox.local:8006',
			img: {
				src: icon,
			},
			span: 4,
		},
	});
</script>

<!-- No probe has answered yet. Unknown is its own colour, not offline: a service
     that has not been reached is not a service that is down. -->
<Story
	name="Status unknown"
	play={async ({ args, canvas, canvasElement }) => {
		// `title` is required, in the schema and in `requiredProps` — a title-less
		// entry used to pass validation and render an empty heading.
		await expect(
			canvas.getByRole('heading', {
				level: 3,
			}),
		).toHaveTextContent(args.title);

		await expect(canvas.getByLabelText(m.service_status_unknown())).toHaveClass('bg-ty-ghost');

		// Which machine a tile points at is the second thing an operator wants after
		// the name, and it is the only way two boxes on one host tell each other apart.
		await expect(canvas.getByText('proxmox.local:8006')).toBeInTheDocument();

		const box = canvasElement.querySelector('a');

		// `--span` must always be emitted: an unset custom property makes
		// `grid-column` invalid at computed-value time, dropping the declaration.
		await expect(box).toHaveStyle({
			'--span': '4',
		});

		// A translucent inset sitting on the page carries its own blur, or the
		// theme's background image shows through unfrosted beside the other cards.
		await expect(box).toHaveClass('backdrop-blur');
		await expect(box).toHaveClass('bg-surface-inset');
	}}
/>

<!-- Reachable. The dot is the only thing that differs between the three states,
     so it names its state in text as well as in colour. -->
<Story
	name="Online"
	args={{
		isOnline: true,
	}}
	play={async ({ canvas }) => {
		await expect(canvas.getByLabelText(m.service_status_online())).toHaveClass('bg-success');

		// The other two states must not linger — the dot is one element, not three
		await expect(canvas.queryByLabelText(m.service_status_offline())).not.toBeInTheDocument();
		await expect(canvas.queryByLabelText(m.service_status_unknown())).not.toBeInTheDocument();
	}}
/>

<!-- Unreachable, and still a link: the box stays clickable so the user can go and
     look at a service the dashboard could not probe. -->
<Story
	name="Offline"
	args={{
		isOnline: false,
	}}
	play={async ({ args, canvas }) => {
		await expect(canvas.getByLabelText(m.service_status_offline())).toHaveClass('bg-danger');

		const link = canvas.getByRole('link');

		// Services live on other hosts, so the tab is new and the dashboard's own
		// URL — the internal network map — must not travel as the referrer.
		await expect(link).toHaveAttribute('href', args.href);
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noreferrer');
	}}
/>

<!-- Its own story rather than a step inside a play function: axe only ever sees a
     story's rest state, and this is the state where the icon is a letter rather than
     an image — the one that has to stay hidden from assistive tech. -->
<Story
	name="Icon unavailable"
	args={{
		img: {
			src: '/no-such-icon.svg',
		},
		isOnline: true,
	}}
	play={async ({ canvas, canvasElement }) => {
		// the CDNs config.example.json names need a route out of the LAN; without
		// this the tile carried the browser's broken-image glyph, which reads as a
		// rendering fault rather than as a missing icon
		// waitFor, and not on the default 1s: the swap waits on the image's error
		// event, and under a full parallel run that took longer than a second.
		await waitFor(
			async () => {
				await expect(canvas.getByText('P')).toBeInTheDocument();
			},
			{
				timeout: 5000,
			},
		);

		await expect(canvasElement.querySelector('img')).toBeNull();
	}}
/>

<!-- `span` is a token (1-12) mapped to a custom property, never a class name: a
     class that only ever appears in runtime config produces no CSS at all. -->
<Story
	name="Full width, no span configured"
	args={{
		span: undefined,
		isOnline: true,
	}}
	play={async ({ canvasElement }) => {
		// `spanStyle()` defaults to the full 12 rather than emitting nothing
		await expect(canvasElement.querySelector('a')).toHaveStyle({
			'--span': '12',
		});
	}}
/>
