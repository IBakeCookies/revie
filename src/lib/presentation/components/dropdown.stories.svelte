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

<!-- The header's theme picker, closed: CSS-driven, so the panel is in the DOM from the
     first render rather than mounted on an open state. -->
<Story
	name="Closed"
	play={async ({ canvas }) => {
		const trigger = canvas.getByRole('button', {
			name: 'Theme',
		});

		// Ghost at rest: the header seats it in a recessed track, so the fill is what
		// hovering adds, not what the trigger carries. The COMPUTED fill is what says
		// so — `hover:bg-surface-card` and `bg-surface-card` are two different tokens,
		// so a `.not` on the class name passes however the trigger is filled.
		await expect(trigger).toHaveClass('hover:bg-surface-card');
		await expect(getComputedStyle(trigger).backgroundColor).toBe('rgba(0, 0, 0, 0)');

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
		<!-- Padded so the dropdown is not under the pointer's resting (0, 0): the wrapper
		     is full-width, so at the canvas origin `group-hover` opens the panel and every
		     rest-state assertion above measures the OPEN dropdown. -->
		<div class="p-16">
			<!-- `children` is the panel, so it cannot come through a spread of `args` -->
			<Dropdown panelClass={args.panelClass}>
				{#snippet trigger()}Theme{/snippet}

				<button onclick={() => choose('solid-dark')}>solid-dark</button>
			</Dropdown>
		</div>
	{/snippet}
</Story>

<!-- Opening is `group-hover` on the wrapper, so pointing at the trigger reveals the
     panel with no click and no JS. There is no aria-expanded to assert: the open state
     lives in CSS, so no component state exists to report. -->
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

<!-- The other half of opening it: `group-focus-within`. `invisible` takes the panel's
     buttons out of the tab order, so hover alone let a keyboard reach the trigger and
     then gave it nothing to open. Only a Tab can prove those two classes work, which is
     why this is a story rather than a class assertion. -->
<Story
	name="Opens on keyboard focus"
	play={async ({ canvas, userEvent }) => {
		await userEvent.tab();

		await expect(
			canvas.getByRole('button', {
				name: 'Theme',
			}),
		).toHaveFocus();

		await waitFor(() =>
			expect(
				canvas.getByRole('button', {
					name: 'solid-dark',
				}),
			).toBeVisible(),
		);

		// What the tab order is about: focus can leave the trigger and land on the option,
		// which is exactly what `visibility: hidden` had made impossible.
		await userEvent.tab();

		await expect(
			canvas.getByRole('button', {
				name: 'solid-dark',
			}),
		).toHaveFocus();
	}}
>
	{#snippet template(args)}
		<!-- Padded so the dropdown is not under the pointer's resting (0, 0): the wrapper is
		     full-width, so at the canvas origin `group-hover` opens the panel and this story
		     would pass without the focus classes it exists to prove. -->
		<div class="p-16">
			<Dropdown panelClass={args.panelClass}>
				{#snippet trigger()}Theme{/snippet}

				<button onclick={() => choose('solid-dark')}>solid-dark</button>
			</Dropdown>
		</div>
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
     themes. -->
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
