import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import Dropdown from '$lib/presentation/components/dropdown.svelte';

const trigger = createRawSnippet(() => ({ render: () => '<span>Theme</span>' }));
const children = createRawSnippet(() => ({ render: () => '<button>solid-dark</button>' }));

describe('dropdown.svelte', () => {
	it('renders the trigger inside the only focusable control of the closed dropdown', async () => {
		const screen = render(Dropdown, { trigger, children });

		await expect.element(screen.getByRole('button', { name: 'Theme' })).toBeInTheDocument();
	});

	it('renders the panel content', async () => {
		const screen = render(Dropdown, { trigger, children });

		await expect
			.element(screen.getByRole('button', { name: 'solid-dark' }))
			.toBeInTheDocument();
	});

	it('hides the panel until the dropdown is hovered', () => {
		const screen = render(Dropdown, { trigger, children });
		const panel = screen.container.querySelector('.invisible');

		expect(panel?.classList.contains('group-hover:visible')).toBe(true);
	});
});
