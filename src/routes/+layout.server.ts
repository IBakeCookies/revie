import type { LayoutServerLoad } from './$types';
import type { ThemeName } from '$lib/store/theme-store.svelte';
import { type Config } from '$lib/utils/config';
// import https from 'https';

// const agent = new https.Agent({
// 	rejectUnauthorized: false
// });

export const load: LayoutServerLoad = async (event) => {
	let config: Config = {
		pages: {}
	};

	// event.fetch('https://192.168.178.180:8006/api2/json/access/ticket', {
	// 	method: 'POST',
	// 	headers: {
	// 		'Content-Type': 'application/x-www-form-urlencoded'
	// 	},
	// 	body: new URLSearchParams({
	// 		username: 'root@pam',
	// 		password: 'yourpassword'
	// 	}),
	// 	agent:
	// })
	// 	.then((r) => r.json())
	// 	.then((data) => console.log(data))
	// 	.catch(console.error);

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
