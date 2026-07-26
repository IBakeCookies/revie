import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BoxService from '$lib/presentation/components/box-service.svelte';
import { m } from '$lib/paraglide/messages';
import { spanOf } from '$lib/test/dom';

const props = {
	title: 'Proxmox',
	href: 'https://proxmox.local:8006',
	img: { src: '/favicon.svg' }
};

describe('box-service.svelte', () => {
	it('links to the service without leaking the dashboard as referrer', async () => {
		const screen = render(BoxService, props);
		const link = screen.getByRole('link');

		await expect.element(link).toHaveAttribute('href', props.href);
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noreferrer');
	});

	it('shows the title next to an icon that is hidden from assistive tech', async () => {
		const screen = render(BoxService, props);
		const img = screen.container.querySelector('img');

		await expect
			.element(screen.getByRole('heading', { level: 3 }))
			.toHaveTextContent('Proxmox');
		expect(img?.getAttribute('src')).toBe('/favicon.svg');
		expect(img?.getAttribute('alt')).toBe('');
	});

	it('passes the column span as a custom property, because config cannot reach Tailwind', () => {
		const screen = render(BoxService, { ...props, span: 6 });

		expect(spanOf(screen.container)).toBe('6');
	});

	it('falls back to the full width when no span is configured', () => {
		const screen = render(BoxService, props);

		expect(spanOf(screen.container)).toBe('12');
	});

	it('marks an unknown status apart from offline', async () => {
		const screen = render(BoxService, props);
		const dot = screen.getByLabelText(m.service_status_unknown());

		await expect.element(dot).toHaveClass('bg-primary');
	});

	it('marks a reachable service as online', async () => {
		const screen = render(BoxService, { ...props, isOnline: true });

		await expect
			.element(screen.getByLabelText(m.service_status_online()))
			.toHaveClass('bg-success');
	});

	it('marks an unreachable service as offline', async () => {
		const screen = render(BoxService, { ...props, isOnline: false });

		await expect
			.element(screen.getByLabelText(m.service_status_offline()))
			.toHaveClass('bg-danger');
	});
});
