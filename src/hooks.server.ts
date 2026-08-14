import type { Handle } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import { isAdminAuthenticated, isAdminEnabled } from '$lib/business/model/admin-auth';
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

const ADMIN_LOGIN_PATH = '/admin/login';
// `/administration` is a config page like any other, so the prefix is the segment
// and not the string. The exact `/admin` key IS taken, though: a config that names
// it loses that page the moment DASHBOARD_ADMIN_TOKEN is set, and the guard winning
// over config is the intended precedence — a reserved path that a config file could
// take back is not reserved. Documented in README.md rather than warned about at
// runtime: business/model/config.ts is browser-safe and cannot read the env, so
// detecting the collision would mean threading the enabled flag through
// normalization for one diagnostic.
const isAdminPath = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/');

const handleAdmin: Handle = ({ event, resolve }) => {
	const { pathname } = event.url;

	if (!isAdminPath(pathname)) return resolve(event);

	// 404 and not 401: with no token configured there is no admin area to be
	// unauthorized for, and answering 401 would tell a visitor it exists.
	if (!isAdminEnabled()) error(404, `No dashboard page is configured for "${pathname}"`);

	// The login form is the one page reachable while signed out — gating it too
	// would redirect it to itself.
	if (pathname !== ADMIN_LOGIN_PATH && !isAdminAuthenticated(event.cookies)) {
		redirect(303, ADMIN_LOGIN_PATH);
	}

	return resolve(event);
};

// handleAdmin sits after paraglide so the login page it lets through still has a
// locale; the redirect and the 404 leave the two appearance hooks unreached,
// which is what they should be for a response that renders no page.
export const handle: Handle = sequence(
	handleParaglide,
	handleAdmin,
	handleTheme,
	handleSceneryMotion,
);
