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
// IPv4, spelled out, and it has to match `href` on the fixture's Loopback service: that
// service IS this server, and `/api/ping` TCP-connects to the literal address the config
// names. `vite preview` otherwise binds the *hostname* `localhost`, which resolves to ::1
// on a machine whose /etc/hosts maps it — GitHub's runners do — and then the browser
// follows that resolution and loads the page while the probe gets ECONNREFUSED, so the
// online dot goes red on CI only. `url` rather than `port` because `port` implies
// localhost; it does not set `baseURL` the way `port` does, hence `use.baseURL` below.
const previewUrl = 'http://127.0.0.1:4173';

export default defineConfig({
	webServer: {
		command: `npm run build && npm run preview -- --host ${new URL(previewUrl).hostname}`,
		url: previewUrl,
		timeout: serverTimeout,
		// The dashboard renders whatever config it is pointed at, so the tests bring
		// their own instead of depending on the services of the machine they run on.
		env: {
			DASHBOARD_CONFIG: 'e2e/fixture-config.json',
			// Switches the admin area on for this server — unset, every /admin path
			// 404s. Spelled again in can-sign-in-as-admin.e2e.ts, because this reaches
			// the server process and not the test one.
			DASHBOARD_ADMIN_TOKEN: 'e2e-operator-token',
			// Without this the load treats the box as an ABSENCE and reports nothing, so
			// the two toast tests find an empty live region — green locally off a
			// gitignored `.env`, red on CI, which has none. The name after the prefix is
			// the fixture's own `"secret": "E2E_ADGUARD"`. The fixture's AdGuard port is
			// closed, so the fetch fails whatever the value is; it only has to exist and
			// to carry the colon AdGuard's provider checks for.
			DASHBOARD_SECRET_E2E_ADGUARD: 'e2e-adguard-user:e2e-adguard-password',
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
		baseURL: previewUrl,
		// The fixture's language, pinned for the same reason its config and its env are:
		// `preferredLanguage` is in the paraglide strategy, so an unpinned Chromium sends the
		// machine's own `Accept-Language` and every spec asserting English copy goes red on a
		// de-* runner while staying green here.
		locale: 'en-US',
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
