import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import { themes } from '$lib/store/theme-store.svelte';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

const handleTheme: Handle = ({ event, resolve }) => {
	const cookieTheme = event.cookies.get('theme');
	const theme = themes.find((item) => item.name === cookieTheme);

	// The placeholder always has to be replaced, otherwise it ends up in the markup.
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%theme%', theme?.css.join(' ') ?? '')
	});
};

export const handle: Handle = sequence(handleParaglide, handleTheme);
