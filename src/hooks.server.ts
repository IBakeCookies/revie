import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import { readRequestAppearance } from '$lib/business/model/appearance';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

const handleTheme: Handle = ({ event, resolve }) => {
	const { themeClass } = readRequestAppearance(event.cookies);

	// The placeholder always has to be replaced, otherwise it ends up in the markup.
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%theme%', themeClass)
	});
};

// No cookie yet leaves the placeholder empty — app.html's inline script then
// decides from prefers-reduced-motion before first paint.
const handleSceneryMotion: Handle = ({ event, resolve }) => {
	const sceneryPausedClass = readRequestAppearance(event.cookies).sceneryPaused
		? 'scenery-paused'
		: '';

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%scenery-paused%', sceneryPausedClass)
	});
};

export const handle: Handle = sequence(handleParaglide, handleTheme, handleSceneryMotion);
