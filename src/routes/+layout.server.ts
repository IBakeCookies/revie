import type { LayoutServerLoad } from './$types';
import { readConfig } from '$lib/server/config';
import { readOrMintScenerySeed, readRequestAppearance } from '$lib/business/appearance';

export const load: LayoutServerLoad = async (event) => {
	const config = await readConfig();
	const appearance = readRequestAppearance(event.cookies);

	return {
		// Only what the navigation needs; the containers are loaded per page.
		pages: Object.entries(config.pages).map(([path, page]) => ({
			path,
			name: page.name || path
		})),
		// undefined (unknown or absent) lets the client fall back to its defaults
		theme: appearance.theme,
		// undefined (no cookie yet) lets the client fall back to prefers-reduced-motion
		sceneryPaused: appearance.sceneryPaused,
		// one seed per user varies the animated theme scenery; minted once,
		// then stable across visits (the reroll button rewrites the cookie)
		scenerySeed: readOrMintScenerySeed(event.cookies)
	};
};
