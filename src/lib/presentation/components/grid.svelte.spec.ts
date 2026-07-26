import type { ConfigContainer } from '$lib/business/model/config';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Grid from '$lib/presentation/components/grid.svelte';
import { spanOf } from '$lib/test/dom';

const items: ConfigContainer[] = [
	{
		name: 'SubGrid',
		props: {
			subTitle: 'Smart Home',
			items: [{ name: 'SubGrid', props: { subTitle: 'Lights', items: [] } }]
		}
	}
];

describe('grid.svelte', () => {
	it('renders the configured containers at any nesting depth', async () => {
		const screen = render(Grid, { title: 'Services', items });

		await expect.element(screen.getByText('Smart Home')).toBeInTheDocument();
		await expect.element(screen.getByText('Lights')).toBeInTheDocument();
	});

	it('shows the title and the subtitle', async () => {
		const screen = render(Grid, { title: 'Services', subTitle: 'All of them', items: [] });

		await expect.element(screen.getByText('Services')).toBeInTheDocument();
		await expect.element(screen.getByText('All of them')).toBeInTheDocument();
	});

	it('omits both headings when the config names neither', () => {
		const screen = render(Grid, { items: [] });

		expect(screen.container.querySelectorAll('h3, h5')).toHaveLength(0);
	});

	it('passes the column span as a custom property', () => {
		const screen = render(Grid, { items: [], span: 8 });

		expect(spanOf(screen.container)).toBe('8');
	});
});
