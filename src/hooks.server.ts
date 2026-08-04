import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import { readRequestAppearance } from '$lib/business/model/appearance';
import { DEFAULT_DARK_THEME, DEFAULT_THEME, getClassesToAdd } from '$lib/business/model/theme';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale),
		});
	});

// app.html's pre-paint script swaps the default theme's classes for the dark
// default's; injecting them as JS array literals keeps the catalogue in
// business/model/theme.ts the single source of both.
const defaultThemeClasses = JSON.stringify(getClassesToAdd(DEFAULT_THEME));
const defaultDarkThemeClasses = JSON.stringify(getClassesToAdd(DEFAULT_DARK_THEME));

const handleTheme: Handle = ({ event, resolve }) => {
	const { themeClass } = readRequestAppearance(event.cookies);

	// Every placeholder always has to be replaced, otherwise it ends up in the
	// markup — as a syntax error, for the two inside the script.
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%theme%', themeClass)
				.replace('%theme.default%', defaultThemeClasses)
				.replace('%theme.default-dark%', defaultDarkThemeClasses),
	});
};

// No cookie yet leaves the placeholder empty — app.html's inline script then
// decides from prefers-reduced-motion before first paint.
const handleSceneryMotion: Handle = ({ event, resolve }) => {
	const sceneryPausedClass = readRequestAppearance(event.cookies).sceneryPaused
		? 'scenery-paused'
		: '';

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%scenery-paused%', sceneryPausedClass),
	});
};

export const handle: Handle = sequence(handleParaglide, handleTheme, handleSceneryMotion);
