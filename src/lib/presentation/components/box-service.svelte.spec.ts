import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import icon from '$lib/presentation/assets/favicon.svg';
import BoxService from '$lib/presentation/components/box-service.svelte';

// The app's own icon, imported rather than spelled as `/favicon.svg`: nothing serves
// static/ to these tests, so that path 404'd and the tile silently fell back to its
// letter — which is the state the story beside this file covers on purpose. Vite
// inlines the asset as a data URI, so the icon decodes with no request to lose the
// race against.
const props = {
	title: 'Proxmox',
	href: 'https://proxmox.local:8006',
	img: {
		src: icon,
	},
};

// Two cases, and only two: everything else this file used to assert is asserted by
// box-service.stories.svelte, which renders the same component against real CSS.
describe('box-service.svelte', () => {
	// Polled, not queried: the <img> stays in the DOM until `error` fires, so a src
	// that never loads passes an existence check and only then vanishes. Decoding is
	// the assertion — it is what the 404'd path above failed to do, unnoticed.
	it('loads the icon rather than merely keeping the element', async () => {
		const screen = await render(BoxService, props);
		const img = screen.container.querySelector('img');

		await expect.poll(() => img?.naturalWidth).toBeGreaterThan(0);
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
});
