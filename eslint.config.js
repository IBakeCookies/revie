import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import storybook from 'eslint-plugin-storybook';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

// `no-restricted-imports` is NOT additive across flat-config blocks: the last block
// matching a file wins the whole rule, so every layer block below restates this
// alongside its own patterns. Two relative specifiers have no `$lib` spelling —
// `./$types` is generated per route by `svelte-kit sync`, and a route-sibling spec
// imports the route file itself (`./+server`, `./+page.server`).
const noRelativeImports = {
	group: ['./*', '../*', '!./$types', '!./+*'],
	message: 'Import through the $lib alias, not a relative path.',
};

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	storybook.configs['flat/recommended'],
	// Both must sit ABOVE the rules block: eslint-config-prettier turns OFF
	// `comma-dangle`, `arrow-parens`, `eol-last` and `object-curly-newline`, so a block
	// that sets them has to come after, or the settings below are silently dead.
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',

			'@typescript-eslint/consistent-type-imports': [
				'error',
				{
					prefer: 'type-imports',
				},
			],

			// Named exports only; a default export is for a Svelte component. A whole
			// plugin for one rule is not worth it — the core selector says the same thing.
			'no-restricted-syntax': [
				'error',
				{
					selector: 'ExportDefaultDeclaration',
					message: 'Named exports only; default exports are for Svelte components.',
				},
			],
			'no-restricted-imports': [
				'error',
				{
					patterns: [noRelativeImports],
				},
			],

			'no-debugger': 'error',
			'no-eval': 'error',
			'no-alert': 'error',
			'no-var': 'error',
			'no-return-await': 'error',
			'prefer-template': 'error',
			'max-depth': ['error', 3],
			'no-else-return': [
				'error',
				{
					allowElseIf: false,
				},
			],

			// Agrees with prettier's `trailingComma: "all"` — the two must stay in step,
			// because `prettier --check .` runs first in `npm run lint` and would fail on
			// anything this rule then demanded. Deprecated in eslint 9 (it moved to
			// @stylistic) and redundant with prettier on formatted files; kept because it
			// names the intent where a reader looks for rules, not formatting.
			'comma-dangle': ['error', 'always-multiline'],
			'arrow-parens': ['error', 'always'],
			'eol-last': ['error', 'always'],
			'object-curly-newline': [
				'error',
				{
					ObjectExpression: {
						multiline: true,
						minProperties: 1,
					},
				},
			],
			// prettier does not manage blank lines, so this is the one formatting-adjacent
			// rule that does not fight it. Kept byte-identical to zenith's.
			'padding-line-between-statements': [
				'error',
				{
					blankLine: 'always',
					prev: ['if'],
					next: ['*'],
				},
				{
					blankLine: 'always',
					prev: ['*'],
					next: ['if'],
				},
				{
					blankLine: 'always',
					prev: ['*'],
					next: ['return'],
				},
				{
					blankLine: 'always',
					prev: ['import'],
					next: ['*'],
				},
				{
					blankLine: 'never',
					prev: ['import'],
					next: ['import'],
				},
				{
					blankLine: 'never',
					prev: ['const', 'let'],
					next: ['const', 'let'],
				},
				{
					blankLine: 'always',
					prev: [
						'block',
						'block-like',
						'multiline-block-like',
						'multiline-expression',
						'multiline-const',
					],
					next: ['const', 'let'],
				},
				{
					blankLine: 'always',
					prev: ['const', 'let'],
					next: [
						'block',
						'block-like',
						'multiline-block-like',
						'multiline-expression',
						'multiline-const',
					],
				},
				{
					blankLine: 'always',
					prev: ['*'],
					next: [
						'block',
						'block-like',
						'multiline-block-like',
						'multiline-expression',
						'multiline-const',
						'export',
					],
				},
				{
					blankLine: 'always',
					prev: [
						'block',
						'block-like',
						'multiline-block-like',
						'multiline-expression',
						'multiline-const',
						'export',
					],
					next: ['*'],
				},
			],
		},
	},
	{
		// A config file and a story are loaded by their tool through the default
		// export; that is the tool's contract, not this repo's export style.
		files: ['*.config.{js,ts}', '.storybook/**', '**/*.stories.*'],
		rules: {
			'no-restricted-syntax': 'off',
		},
	},
	{
		// None of these resolves `$lib`: playwright runs the e2e specs through its own
		// loader with no vite aliases, .storybook sits outside `src`, and a root config
		// is loaded by its tool from disk.
		files: ['*.config.{js,ts}', 'e2e/**', '.storybook/**'],
		rules: {
			'no-restricted-imports': 'off',
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig,
			},
		},
		rules: {
			// Links come from the config file and mostly point at other hosts, so they
			// cannot be resolved against this app's routes.
			'svelte/no-navigation-without-resolve': [
				'error',
				{
					ignoreLinks: true,
				},
			],
		},
	},

	// ---- Layer boundaries (presentation → business → data, one direction) ----
	{
		files: ['src/lib/data/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						noRelativeImports,
						{
							group: [
								'$lib/business/*',
								'$lib/business/**',
								'$lib/presentation/*',
								'$lib/presentation/**',
							],
							message: 'The data layer must not import from the business or presentation layers.',
						},
					],
				},
			],
		},
	},
	{
		files: ['src/lib/business/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						noRelativeImports,
						{
							group: ['$lib/presentation/*', '$lib/presentation/**'],
							message: 'The business layer must not import from the presentation layer.',
						},
					],
				},
			],
		},
	},
	{
		// `src/hooks*.ts` covers both src/hooks.ts and src/hooks.server.ts: they render
		// and reroute, so they go through the business layer like any route would.
		files: ['src/lib/presentation/**', 'src/routes/**', 'src/hooks*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						noRelativeImports,
						{
							group: ['$lib/data/*', '$lib/data/**'],
							message:
								'Presentation code must go through the business layer (a store in $lib/business/store, a model in $lib/business/model).',
						},
					],
				},
			],
		},
	},
	{
		// The leaf imports nothing internal at all — that is what lets every layer
		// value-import it.
		files: ['src/lib/utils/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						noRelativeImports,
						{
							group: [
								'$lib/data/*',
								'$lib/data/**',
								'$lib/business/*',
								'$lib/business/**',
								'$lib/presentation/*',
								'$lib/presentation/**',
							],
							message: 'src/lib/utils is the leaf: it imports nothing internal.',
						},
					],
				},
			],
		},
	},
);
