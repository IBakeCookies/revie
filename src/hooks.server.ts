import type { Handle } from '@sveltejs/kit';
import type { ThemeName } from '$lib/composable/useTheme.svelte';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import { getClassesToAdd, themes } from '$lib/store/theme-store.svelte';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

const handleTheme: Handle = async ({ event, resolve }) => {
	const { cookies } = event;
	const theme = cookies.get('theme') as ThemeName;

	if (!theme || !themes.find((t) => t.name === theme)) {
		return await resolve(event);
	}

	const themeClass = getClassesToAdd(theme).join(' ');

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%theme%', themeClass)
	});

	return response;
};

export const handle: Handle = sequence(handleParaglide, handleTheme);
