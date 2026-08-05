<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, userEvent } from 'storybook/test';
	import Toasts from '$lib/presentation/components/toasts.svelte';
	import { m } from '$lib/paraglide/messages';

	const { Story } = defineMeta({
		title: 'Components/Toasts',
		component: Toasts,
		tags: ['autodocs'],
		args: {
			messages: ['AdGuard responded with 401 Unauthorized'],
			ondismiss: fn(),
		},
	});
</script>

<!-- The live region exists before any message does, which is what makes the first
     toast announced rather than silent. -->
<Story
	name="Empty"
	args={{
		messages: [],
	}}
	play={async ({ canvasElement }) => {
		const region = canvasElement.querySelector('[role="status"]');

		await expect(region).toBeInTheDocument();
		await expect(region).toHaveAttribute('aria-live', 'polite');
		await expect(canvasElement.querySelectorAll('button')).toHaveLength(0);
	}}
/>

<!-- `AppError.message` is guaranteed renderable, so the body is the message and
     nothing else — never `cause`. -->
<Story
	name="One failure"
	play={async ({ canvas }) => {
		await expect(canvas.getByText('AdGuard responded with 401 Unauthorized')).toBeInTheDocument();
	}}
/>

<!-- Two producers can fail at once: a dead AdGuard box and a failed service probe. -->
<Story
	name="Several failures"
	args={{
		messages: ['AdGuard responded with 401 Unauthorized', 'Could not reach http://wled.local'],
	}}
	play={async ({ canvas }) => {
		await expect(canvas.getAllByLabelText(m.toast_dismiss())).toHaveLength(2);
	}}
/>

<!-- The dismiss button carries a label because its content is a glyph: without one its
     accessible name is "✕", which names the shape and not the action. -->
<Story
	name="Dismisses the message it belongs to"
	args={{
		messages: ['first', 'second'],
	}}
	play={async ({ args, canvas }) => {
		await userEvent.click(canvas.getAllByLabelText(m.toast_dismiss())[1]);

		await expect(args.ondismiss).toHaveBeenCalledWith('second');
	}}
/>
