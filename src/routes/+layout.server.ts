import type { LayoutServerLoad } from './$types';
import type { ThemeName } from '$lib/store/theme-store.svelte';
import { readConfig } from '$lib/server/config';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const config = await readConfig();

	return {
		// Only what the navigation needs; the containers are loaded per page.
		pages: Object.entries(config.pages).map(([path, page]) => ({
			path,
			name: page.name || path
		})),
		theme: cookies.get('theme') as ThemeName | undefined
	};
};
