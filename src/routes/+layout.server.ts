import type { LayoutServerLoad } from './$types';
import type { ThemeName } from '$lib/store/theme-store.svelte';
import { type Config } from '$lib/utils/config';

export const load: LayoutServerLoad = async (event) => {
	let config: Config = {
		pages: {}
	};

	try {
		const rawConfig = await event.fetch('/config.json');
		config = await rawConfig.json();
	} catch (err) {
		console.log(err);
	}

	return {
		config,
		theme: event.cookies.get('theme') as ThemeName | undefined
	};
};
