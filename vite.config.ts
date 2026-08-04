import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'node:path';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
		}),
	],
	test: {
		maxWorkers: process.env.CI ? 1 : 6,
		expect: {
			requireAssertions: true,
		},
		// Module mocks are shared across the tests of a file, so their call history has
		// to be dropped between them.
		clearMocks: true,
		reporters: ['default', 'html'],
		outputFile: {
			html: 'test-result/unit/index.html',
		},
		coverage: {
			enabled: true,
			provider: 'v8',
			include: [
				'src/lib/business/**/*.ts',
				'src/lib/data/**/*.ts',
				'src/lib/presentation/**/*.{ts,svelte}',
			],
			// Setting `exclude` replaces Vitest's defaults, so the test files
			// themselves have to be listed back or they are measured as source.
			exclude: ['**/*.{test,spec}.ts', '**/*.stories.svelte'],
			reportsDirectory: 'test-result/coverage',
			reporter: ['text', 'html'],
			// No `thresholds`: zenith sets none either. A floor has to be pinned to a
			// measured baseline, and inventing one here just makes CI red on day one.
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [
							{
								browser: 'chromium',
								headless: true,
							},
						],
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/data/**'],
				},
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}'],
				},
			},
			{
				// Runs every story's play function as a test. A story with no play
				// function still renders here, so a component that throws on mount
				// fails the suite.
				extends: true,
				plugins: [
					storybookTest({
						configDir: path.join(import.meta.dirname, '.storybook'),
					}),
				],
				test: {
					name: 'storybook',
					browser: {
						enabled: true,
						headless: true,
						provider: playwright({}),
						instances: [
							{
								browser: 'chromium',
							},
						],
					},
				},
			},
		],
	},
});
