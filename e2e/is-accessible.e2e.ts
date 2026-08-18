import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { themes } from '../src/lib/business/model/theme';

// Everything the fixture can render: two configured pages and the configured 404.
const paths = ['/', '/services', '/nope'];
// The conformance levels this project claims, PLUS `best-practice` — which is not
// optional here and is the whole reason this file exists. Measured against the installed
// axe-core: `landmark-one-main`, `landmark-banner-is-top-level`, `landmark-unique`,
// `region` and `heading-order` are tagged `cat.semantics,best-practice` and NOTHING else,
// while only `document-title`, `color-contrast` and `link-name` carry a wcag tag. So the
// four conformance tags alone exclude every rule this audit was added to enforce: the
// banner landmark, and the heading order the `headingLevel` prop threads through the
// config recursion. With them the gate cannot go red on its own subject.
const auditTags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

async function auditPath(page: Page, path: string) {
	await page.goto(path);

	const audit = new AxeBuilder({
		page,
	});

	const results = await audit.withTags(auditTags).analyze();

	expect(results.violations).toEqual([]);
}

// Axe cannot fence this one, which is why it is spelled out: no rule requires a page to
// HAVE a banner. `landmark-banner-is-top-level` only checks a banner that already exists,
// and `region` is satisfied by any landmark, so the pre-#21 markup — <header> nested
// inside <main>, where it maps to `generic` — passes every axe rule there is. Measured:
// put the header back inside main and the whole audit above stays green.
test('gives the page a banner landmark and a main landmark', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByRole('banner')).toBeVisible();

	// Exactly one of each: two mains is `landmark-one-main`, which the audit does cover.
	await expect(page.getByRole('main')).toHaveCount(1);

	// The header is a SIBLING of main, not inside it — the nesting is the whole defect,
	// and `banner` existing is not by itself proof of it.
	await expect(page.getByRole('main').getByRole('banner')).toHaveCount(0);
});

// The storybook a11y gate only ever sees one component with no layout above it, so the
// landmarks, the heading order across a whole page and <title> can only be checked here.
for (const path of paths) {
	test(`has no accessibility violations on ${path}`, async ({ page }) => {
		await auditPath(page, path);
	});
}

test.describe('in German', () => {
	test.use({
		locale: 'de-DE',
	});

	// Every accessible name on the page comes from a message, so a key missing from
	// de.json renders English rather than failing the build — and one that renders
	// nothing at all is an empty name only this run can see.
	for (const path of paths) {
		test(`has no accessibility violations on ${path}`, async ({ page }) => {
			await auditPath(page, path);
		});
	}
});

test.describe('with an operating system that prefers dark', () => {
	test.use({
		colorScheme: 'dark',
	});

	// The pre-paint script stamps the dark default with no cookie in play, which is a
	// palette none of the runs above ever renders.
	test('has no accessibility violations on the dashboard', async ({ page }) => {
		await auditPath(page, '/');
	});
});

/* Parameterized over the catalogue rather than a hand-written list, so a theme is covered
   the day it lands. `color-contrast` only, and one path: nothing but the palette changes
   between themes, so the other rules would answer identically 27 times over.

   Read the last test in this block before trusting the loop. Axe cannot compute a contrast
   ratio through a background it cannot flatten: `_getBackgroundColor` bails the moment the
   stack contains an image or a gradient, so on 25 of the 27 themes it returns ~23 nodes
   `incomplete` and evaluates exactly ONE — the toast paragraph, the only opaque surface on
   the page. `violations` is empty there because nothing was checked, not because the
   palette is readable. That is undecidable rather than fixable: every `--surface-card` in
   this repo is translucent, so the real ratio depends on the pixels underneath.
   It is NOT simply "themes with a `--background-image`" — `abyss` declares none and is
   still unreadable, because its `.theme-helper-3` scenery layer carries a radial-gradient
   that axe counts even under `pointer-events: none`. That is why the honest cover is one
   named baseline theme below rather than a per-theme guess at what axe can see. */
test.describe('on every theme in the catalogue', () => {
	for (const theme of themes) {
		test(`keeps its text readable on ${theme.label}`, async ({ page, baseURL }) => {
			await page.context().addCookies([
				{
					name: 'theme',
					value: theme.name,
					url: baseURL,
				},
			]);

			await page.goto('/');

			// Without this the loop is 27 audits of the default theme: hooks.server.ts
			// stamps the classes off the cookie, so a cookie that did not take is silent.
			await expect(page.locator('html')).toHaveClass(new RegExp(theme.css[0]));

			const audit = new AxeBuilder({
				page,
			});

			const results = await audit.withRules(['color-contrast']).analyze();

			expect(results.violations).toEqual([]);
		});
	}

	// Where the loop above stops being vacuous. `solid-light` (the unprefixed `:root`
	// palette) and `solid-dark` are the only two themes with neither a backdrop photograph
	// nor a scenery gradient, so they are the only two axe can read end to end — measured at
	// ~20 evaluated nodes against 1 on a glass theme. Asserting the COUNT is what makes the
	// 27 assertions above mean something: if a change ever puts an image or a gradient
	// behind this theme too, every one of them silently drops to checking the single opaque
	// toast paragraph, and this is the test that goes red instead of nothing going red.
	test('really evaluates the palette on the one theme axe can read', async ({ page, baseURL }) => {
		await page.context().addCookies([
			{
				name: 'theme',
				value: 'solid-light',
				url: baseURL,
			},
		]);

		await page.goto('/');

		const audit = new AxeBuilder({
			page,
		});

		const results = await audit.withRules(['color-contrast']).analyze();

		expect(results.violations).toEqual([]);
		expect(results.passes.flatMap((rule) => rule.nodes).length).toBeGreaterThan(10);
	});
});
