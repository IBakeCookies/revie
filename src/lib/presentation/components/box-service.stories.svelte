<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import BoxService from '$lib/presentation/components/box-service.svelte';
	import { m } from '$lib/paraglide/messages';

	const { Story } = defineMeta({
		title: 'Components/Box Service',
		component: BoxService,
		tags: ['autodocs'],
		args: {
			title: 'Proxmox',
			href: 'https://proxmox.local:8006',
			img: {
				src: '/favicon.svg',
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

		await expect(canvas.getByLabelText(m.service_status_unknown())).toHaveClass('bg-primary');

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
