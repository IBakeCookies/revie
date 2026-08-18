import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				// Spelled out rather than left to default-src so kit has an explicit
				// directive to attach the nonce to.
				'script-src': ['self'],
				'style-src': ['self'],
				// The app puts computed values in inline style ATTRIBUTES — spanStyle's
				// --span, the scenery vars on .theme-scenery, the generated theme
				// swatches — and kit's own nonced <style> nullifies 'unsafe-inline' in
				// style-src, so the attribute directive is the only way to allow them.
				'style-src-attr': ['unsafe-inline'],
				// Icon hosts come out of config.json, which is read from disk at
				// runtime: no build-time list can enumerate them, and a LAN icon host
				// may well be plain http.
				'img-src': ['self', 'data:', 'http:', 'https:'],
				// Same reason: BoxSearch's action is a config-supplied search engine on
				// the public internet.
				'form-action': ['self', 'http:', 'https:'],
				'base-uri': ['self'],
				'object-src': ['none'],
				'frame-ancestors': ['none'],
			},
		},
	},
};

export default config;
