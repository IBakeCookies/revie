/**
 * Regenerates `docs/screenshot.png` — `npm run screenshot`.
 *
 * It photographs `config.example.json`, deliberately, and not the `config.json` the
 * machine is actually running: the live config is the operator's own network map,
 * and the README image is public. The example is also the file the README tells a
 * new user to copy, so the picture and the first run agree. `DASHBOARD_CONFIG`
 * overrides it for a one-off.
 *
 * The image has to show the app working, and no machine can reach the LAN the config
 * describes: every service probe fails and AdGuard answers nothing, so a plain
 * screenshot is a page of red dots and an "unavailable" box. Two seams stand in for
 * the network, and nothing in `src/` changes for either:
 *
 *   - AdGuard is read server-side during the page load, so a browser mock cannot
 *     reach it. A stub HTTP server serves `/control/stats` and a COPY of the config
 *     points the box at it — the real config is never written to.
 *   - The status dots come from `POST /api/ping`, which the browser makes, so
 *     playwright fulfils it. One service stays offline: the dot is a feature of the
 *     page and a screenshot where every dot is green never shows it.
 *
 * The appearance cookies are set rather than left to the browser's defaults, so the
 * image is the same theme and the same scenery arrangement on every run.
 */

// `@playwright/test` rather than `playwright`: the former is what package.json
// declares, the latter is only its transitive dependency.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE_CONFIG = process.env.DASHBOARD_CONFIG || 'config.example.json';
const OUTPUT = 'docs/screenshot.png';
const PORT = 4180;
const ORIGIN = `http://127.0.0.1:${PORT}`;
/** Substring of the one service href left red, so both dot states are in the image. */
const OFFLINE_HREF = '192.168.1.71';

/** AdGuard's own wire shape — snake_case, seconds — as `data/repository/adguard.ts` reads it. */
const ADGUARD_STATS = {
	num_dns_queries: 128437,
	num_blocked_filtering: 24193,
	avg_processing_time: 0.012,
	top_blocked_domains: [
		{
			'analytics.tiktok.com': 1832,
		},
	],
};

const APPEARANCE = {
	theme: 'revie',
	scenerySeed: '20260814',
	sceneryMotion: 'paused',
};

/** Serves AdGuard's stats endpoint on an ephemeral port. Resolves to its origin. */
async function startAdguardStub() {
	const server = createServer((_, response) => {
		response.writeHead(200, {
			'Content-Type': 'application/json',
		});

		response.end(JSON.stringify(ADGUARD_STATS));
	});

	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

	return {
		origin: `http://127.0.0.1:${server.address().port}`,
		close: () => server.close(),
	};
}

/** Every BoxAdguard on every page, wherever config nests it. */
function repointAdguard(node, origin) {
	if (Array.isArray(node)) {
		node.forEach((item) => repointAdguard(item, origin));

		return;
	}

	if (!node || typeof node !== 'object') {
		return;
	}

	if (node.name === 'BoxAdguard' && node.props) {
		node.props.href = origin;
	}

	Object.values(node).forEach((value) => repointAdguard(value, origin));
}

/** Polls the app until it answers, so the screenshot never races the server's startup. */
async function waitForServer() {
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			await fetch(ORIGIN);

			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	throw new Error(`The dashboard did not come up on ${ORIGIN}`);
}

const adguard = await startAdguardStub();
const workDir = await mkdtemp(join(tmpdir(), 'revie-screenshot-'));
const configPath = join(workDir, 'config.json');
const config = JSON.parse(await readFile(SOURCE_CONFIG, 'utf8'));
repointAdguard(config, adguard.origin);
await writeFile(configPath, JSON.stringify(config));

const server = spawn('node', ['build'], {
	env: {
		...process.env,
		PORT: String(PORT),
		ORIGIN,
		DASHBOARD_CONFIG: configPath,
		ADGUARD_USERNAME: 'screenshot',
		ADGUARD_PASSWORD: 'screenshot',
	},
	stdio: 'inherit',
});

try {
	await waitForServer();

	const browser = await chromium.launch();

	const context = await browser.newContext({
		viewport: {
			width: 1440,
			height: 900,
		},
		deviceScaleFactor: 2,
	});

	await context.addCookies(
		Object.entries(APPEARANCE).map(([name, value]) => ({
			name,
			value,
			url: ORIGIN,
		})),
	);

	const page = await context.newPage();

	await page.route('**/api/ping', (route) =>
		route.fulfill({
			json: {
				isAlive: !route.request().postData()?.includes(OFFLINE_HREF),
			},
		}),
	);

	await page.goto(ORIGIN);
	// The icons are the last thing to arrive and several are CDN-hosted, so the page
	// is only worth photographing once the network has gone quiet. A LAN icon this
	// machine cannot route to never settles, hence the tolerated timeout — the
	// component falls back to the service's initial and the image is right either way.
	await page.waitForLoadState('networkidle').catch(() => {});

	await page.screenshot({
		path: OUTPUT,
		fullPage: true,
	});

	await browser.close();

	console.log(`Wrote ${OUTPUT}`);
} finally {
	server.kill();
	adguard.close();

	await rm(workDir, {
		recursive: true,
		force: true,
	});
}
