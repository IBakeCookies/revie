import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import icon from '$lib/presentation/assets/favicon.svg';
import BoxService from '$lib/presentation/components/box-service.svelte';
import { m } from '$lib/paraglide/messages';
import { spanOf } from '$lib/test/dom';

// The app's own icon, imported rather than spelled as `/favicon.svg`: nothing serves
// static/ to these tests, so that path 404'd and the tile silently fell back to its
// letter — the state the last test here reaches on purpose. Vite inlines the asset as
// a data URI, so the icon decodes with no request to lose the race against.
const props = {
	title: 'Proxmox',
	href: 'https://proxmox.local:8006',
	img: {
		src: icon,
	},
};

describe('box-service.svelte', () => {
	it('links to the service without leaking the dashboard as referrer', async () => {
		const screen = await render(BoxService, props);
		const link = screen.getByRole('link');

		await expect.element(link).toHaveAttribute('href', props.href);
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noreferrer');
	});

	it('shows the title next to an icon that is hidden from assistive tech', async () => {
		const screen = await render(BoxService, props);
		const img = screen.container.querySelector('img');

		await expect
			.element(
				screen.getByRole('heading', {
					level: 3,
				}),
			)
			.toHaveTextContent('Proxmox');

		expect(img?.getAttribute('src')).toBe(icon);
		expect(img?.getAttribute('alt')).toBe('');

		// Polled, not queried: the <img> stays in the DOM until `error` fires, so a src
		// that never loads passes an existence check and only then vanishes. Decoding is
		// the assertion — it is what the 404'd path above failed to do, unnoticed.
		await expect.poll(() => img?.naturalWidth).toBeGreaterThan(0);
	});

	it('names the host the tile points at', async () => {
		const screen = await render(BoxService, props);

		await expect.element(screen.getByText('proxmox.local:8006')).toBeInTheDocument();
	});

	// A hand-edited href is not a URL until it parses: `new URL` would throw here and
	// take the whole page down over one line of config.
	it('shows an unparseable href as it stands rather than failing', async () => {
		const screen = await render(BoxService, {
			...props,
			href: '192.168.1.10:8006',
		});

		await expect.element(screen.getByText('192.168.1.10:8006')).toBeInTheDocument();
	});

	// The icon CDNs config.example.json points at need a route out of the LAN, and a
	// wrong path is a typo away; either way the browser draws its broken-image glyph.
	it('falls back to the initial when the icon cannot be loaded', async () => {
		const screen = await render(BoxService, {
			...props,
			img: {
				src: '/no-such-icon.svg',
			},
		});

		// exact, or the locator also matches 'Proxmox' and its host line
		await expect
			.element(
				screen.getByText('P', {
					exact: true,
				}),
			)
			.toBeInTheDocument();

		expect(screen.container.querySelector('img')).toBeNull();
	});

	it('passes the column span as a custom property, because config cannot reach Tailwind', async () => {
		const screen = await render(BoxService, {
			...props,
			span: 6,
		});

		expect(spanOf(screen.container)).toBe('6');
	});

	it('falls back to the full width when no span is configured', async () => {
		const screen = await render(BoxService, props);

		expect(spanOf(screen.container)).toBe('12');
	});

	it('marks an unknown status apart from offline', async () => {
		const screen = await render(BoxService, props);
		const dot = screen.getByLabelText(m.service_status_unknown());

		await expect.element(dot).toHaveClass('bg-ty-ghost');
	});

	it('marks a reachable service as online', async () => {
		const screen = await render(BoxService, {
			...props,
			isOnline: true,
		});

		await expect
			.element(screen.getByLabelText(m.service_status_online()))
			.toHaveClass('bg-success');
	});

	it('marks an unreachable service as offline', async () => {
		const screen = await render(BoxService, {
			...props,
			isOnline: false,
		});

		await expect
			.element(screen.getByLabelText(m.service_status_offline()))
			.toHaveClass('bg-danger');
	});
});
