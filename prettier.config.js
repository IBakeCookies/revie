/** @type {import("prettier").Config} */
const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'all',
	printWidth: 100,
	// tabWidth is deliberately absent, so it stays at prettier's default 2 — the same
	// accounting zenith uses. With useTabs on, tabWidth is what a tab COUNTS AS when
	// prettier measures a line against printWidth, so a different value here reflows the
	// four ported style files and breaks a verbatim upstream paste.
	plugins: ['prettier-plugin-svelte'],
	overrides: [
		{
			files: '*.svelte',
			options: {
				parser: 'svelte',
			},
		},
	],
};

export default config;
