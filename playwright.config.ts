import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		timeout: 120_000,
		// The dashboard renders whatever config it is pointed at, so the tests bring
		// their own instead of depending on the services of the machine they run on.
		env: { DASHBOARD_CONFIG: 'e2e/fixture-config.json' }
	},
	testDir: 'e2e',
	testMatch: '**/*.spec.ts'
});
