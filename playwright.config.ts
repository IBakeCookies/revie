import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverTimeout = 120 * 1000;
const testTimeout = 60 * 1000;
// Absolute: Playwright resolves `outputDir` against this file's directory but a
// reporter's `outputFolder` against the test root — which is `e2e/` here, because
// `testDir` is set — so a relative path writes the report inside the directory
// being scanned for tests.
const outputDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-result/e2e');

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		timeout: serverTimeout,
		// The dashboard renders whatever config it is pointed at, so the tests bring
		// their own instead of depending on the services of the machine they run on.
		env: {
			DASHBOARD_CONFIG: 'e2e/fixture-config.json',
		},
	},
	timeout: testTimeout,
	outputDir: `${outputDir}/asset`,
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	// Playwright's own default, and worth keeping now that a workflow exists: a stray
	// `test.only` would otherwise let CI go green having run one test.
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : 6,
	reporter: [
		['list'],
		[
			'html',
			{
				outputFolder: `${outputDir}/report`,
			},
		],
	],
	use: {
		trace: 'retain-on-failure',
		video: 'retain-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
			},
		},
	],
});
