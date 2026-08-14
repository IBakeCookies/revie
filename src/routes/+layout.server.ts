import type { LayoutServerLoad } from './$types';
import { isAdminEnabled } from '$lib/business/model/admin-auth';
import { readConfig } from '$lib/business/model/config-source';
import { readOrMintScenerySeed, readRequestAppearance } from '$lib/business/model/appearance';

export const load: LayoutServerLoad = async (event) => {
	const { config, warnings, error, isFresh } = await readConfig();
	const appearance = readRequestAppearance(event.cookies);

	// Only what the file re-read actually turned up, so a broken config costs one log
	// per mtime instead of one per request — this load runs on every one of them. Two
	// concurrent first hits can still log twice; an in-flight promise cache to dedupe
	// that race is more machinery than one duplicate pair is worth.
	if (isFresh) {
		if (error) {
			console.error(error.message, error.cause ?? '');
		}

		for (const warning of warnings) {
			console.warn(warning);
		}
	}

	return {
		// Only what the navigation needs; the containers are loaded per page.
		pages: Object.entries(config.pages).map(([path, page]) => ({
			path,
			name: page.name || path,
		})),
		// undefined (unknown or absent) lets the client fall back to its defaults
		theme: appearance.theme,
		// undefined (no cookie yet) lets the client fall back to prefers-reduced-motion
		sceneryPaused: appearance.sceneryPaused,
		// one seed per user varies the animated theme scenery; minted once,
		// then stable across visits (the reroll button rewrites the cookie)
		scenerySeed: readOrMintScenerySeed(event.cookies),
		// Whether the header shows a link to /admin at all. Unset token means the
		// guard 404s every /admin path, and a switched-off feature must not
		// advertise itself — so the link cannot be unconditional. No "is signed in"
		// counterpart: handleAdmin redirects an unauthenticated /admin to the login
		// form, so one link is right either way.
		adminEnabled: isAdminEnabled(),
	};
};
