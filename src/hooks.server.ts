import type { Handle } from '@sveltejs/kit';
import { error, redirect } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { sequence } from '@sveltejs/kit/hooks';
import { isAdminAuthenticated, isAdminEnabled } from '$lib/business/model/admin-auth';
import { readRequestAppearance } from '$lib/business/model/appearance';
import { DEFAULT_DARK_THEME, DEFAULT_THEME, getClassesToAdd } from '$lib/business/model/theme';

// First in the sequence so it wraps the rest. It only sees responses that come back
// through `resolve`, so handleAdmin's thrown 404 and its 303 are produced above it and
// carry none of these headers.
const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// The dashboard's own URL is an internal LAN address, and every render loads icons
	// from public CDNs (cdn.simpleicons.org, cdn.jsdelivr.net, raw.githubusercontent.com),
	// which get no `Referer` at all under this policy — the whole point of setting one.
	//
	// `same-origin` and NOT `no-referrer`, which is a stronger-looking value that breaks
	// the admin area. Appending a request's `Origin` header is referrer-policy-dependent
	// for a non-CORS request that is not a GET (fetch spec, "append a request Origin
	// header"): under `no-referrer` the origin is serialized as `null` unconditionally,
	// under `same-origin` only when the request really is cross-origin. A form POST is a
	// navigation, so `no-referrer` sent `Origin: null` on the admin login and the config
	// save, kit compared that against `url.origin` and answered 403 `Cross-site POST form
	// submissions are forbidden` — measured, and the four admin e2e cases are the fence.
	// Cross-origin leakage is identical either way; only the same-origin case differs.
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Robots-Tag', 'noindex');

	// The document alone: `GET /` returns German or English HTML purely on the
	// PARAGLIDE_LOCALE cookie, plus cookie-derived theme and scenery-paused classes, with
	// no Vary on it. Unconditional, this would also throw away the year's max-age on the
	// hashed assets under /_app/immutable/ — and kit already sets `private, no-store` on
	// __data.json itself.
	if (response.headers.get('content-type')?.startsWith('text/html')) {
		response.headers.set('Cache-Control', 'private, no-store');
	}

	return response;
};

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
	handleSecurityHeaders,
	handleParaglide,
	handleAdmin,
	handleTheme,
	handleSceneryMotion,
);
