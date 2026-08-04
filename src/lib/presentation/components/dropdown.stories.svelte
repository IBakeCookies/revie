<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, waitFor } from 'storybook/test';
	import Dropdown from '$lib/presentation/components/dropdown.svelte';

	const { Story } = defineMeta({
		title: 'Components/Dropdown',
		component: Dropdown,
		tags: ['autodocs'],
	});

	// The panel's controls belong to the caller — the header wires them to the theme
	// store — so a selection is a mock here, not any state the dropdown holds.
	const choose = fn();
</script>

<!-- The header's theme picker, closed: hover-only and CSS-driven, so the panel is in
     the DOM from the first render rather than mounted on an open state. -->
<Story
	name="Closed"
	play={async ({ canvas }) => {
		// The trigger sits on the page as a translucent card, so it carries its own
		// backdrop-blur; without it the theme's scenery shows through unfrosted.
		const trigger = canvas.getByRole('button', {
			name: 'Theme',
		});

		await expect(trigger).toHaveClass('backdrop-blur');
		await expect(trigger).toHaveClass('bg-surface-card');

		// `invisible` hides the panel, it does not remove it — the options are in the
		// DOM before anything is opened. That is only safe because `visibility: hidden`
		// also takes them out of the accessibility tree and out of the tab order, so
		// they are unreachable rather than merely unseen: hence getByText, not getByRole.
		await expect(canvas.getByText('solid-dark')).not.toBeVisible();

		await expect(
			canvas.queryByRole('button', {
				name: 'solid-dark',
			}),
		).not.toBeInTheDocument();
	}}
>
	{#snippet template(args)}
		<!-- `children` is the panel, so it cannot come through a spread of `args` -->
		<Dropdown panelClass={args.panelClass}>
			{#snippet trigger()}Theme{/snippet}

			<button onclick={() => choose('solid-dark')}>solid-dark</button>
		</Dropdown>
	{/snippet}
</Story>

<!-- Opening is `group-hover` on the wrapper, so pointing at the trigger reveals the
     panel with no click and no JS. There is no aria-expanded to assert: the component
     exposes the state to sighted pointer users only. -->
<Story
	name="Opens on hover"
	play={async ({ canvas, userEvent }) => {
		await userEvent.hover(
			canvas.getByRole('button', {
				name: 'Theme',
			}),
		);

		// `transition-all` carries a duration, and visibility flips part-way through it.
		// Finding the option by ROLE is the assertion: it is back in the accessibility
		// tree, which is what `invisible` had taken it out of.
		await waitFor(() =>
			expect(
				canvas.getByRole('button', {
					name: 'solid-dark',
				}),
			).toBeVisible(),
		);
	}}
>
	{#snippet template(args)}
		<Dropdown panelClass={args.panelClass}>
			{#snippet trigger()}Theme{/snippet}

			<button onclick={() => choose('solid-dark')}>solid-dark</button>
		</Dropdown>
	{/snippet}
</Story>

<!-- What the e2e helper does (e2e/dropdown.ts): hover, then click an option. The
     dropdown reports nothing itself — the option's own handler is the only thing that
     fires, which is what keeps the panel content the caller's business. -->
<Story
	name="Selecting an option"
	play={async ({ canvas, userEvent }) => {
		await userEvent.hover(
			canvas.getByRole('button', {
				name: 'Theme',
			}),
		);

		const item = await waitFor(() =>
			canvas.getByRole('button', {
				name: 'solid-dark',
			}),
		);

		await userEvent.click(item);

		await expect(choose).toHaveBeenCalledTimes(1);
		await expect(choose).toHaveBeenCalledWith('solid-dark');
	}}
>
	{#snippet template(args)}
		<Dropdown panelClass={args.panelClass}>
			{#snippet trigger()}Theme{/snippet}

			<button onclick={() => choose('solid-dark')}>solid-dark</button>
		</Dropdown>
	{/snippet}
</Story>

<!-- The real theme list is 27 entries, so it passes a scroll cap through `panelClass`.
     The panel itself is `bg-popover` — an opaque surface, unlike the trigger's card —
     because it floats over arbitrary content and has to stay readable on the glass
     themes; opaque is also why it needs no backdrop-blur of its own. -->
<Story
	name="Capped theme list"
	args={{
		panelClass: 'nice-scrollbar max-h-[min(80vh,32rem)] overflow-y-auto',
	}}
	play={async ({ canvas }) => {
		const panel = canvas.getByText('solid-dark').parentElement;

		await expect(panel).toHaveClass('bg-popover');
		await expect(panel).toHaveClass('overflow-y-auto');
		await expect(panel).toHaveClass('max-h-[min(80vh,32rem)]');
	}}
>
	{#snippet template(args)}
		<Dropdown panelClass={args.panelClass}>
			{#snippet trigger()}Theme{/snippet}

			<button onclick={() => choose('solid-dark')}>solid-dark</button>
			<button onclick={() => choose('solid-light')}>solid-light</button>
		</Dropdown>
	{/snippet}
</Story>
