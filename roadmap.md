# Roadmap

Every open piece of work, in one file. [AGENTS.md](AGENTS.md) is the architecture and the
invariants; this is what is still wrong or still missing. **Nothing below is fixed** — AGENTS.md's
"Already done" section is the list of decisions that must _not_ be reverted, and is deliberately
not repeated here.

Items 1–13 come from the first architecture review. 14–30 come from a second, seven-lens review
(product, architecture, correctness, security, ops, quality, doc drift). 31–32 come from a third
pass that diffed this repo against [`zenith`](../zenith) — the upstream project these style files
and cruiser rules were ported from — which had already solved several of the items above; where it
has, the item says so and names the files to copy. Every finding was adversarially verified against
the code before it was written down. Ordered within each group by what breaks soonest, or by impact
over effort. Effort is `S` / `M` / `L`.

## Correctness

1. **`config.json` is git-tracked and is also production's default read path.** A `git pull` or
   `checkout .` during an update silently reverts the live dashboard, and the file holds the
   internal network map. Gitignore it, commit `config.example.json`.
2. **Status dots measure the wrong thing** — `/api/ping` discards the port and probes ICMP, so a
   dead service on a live host stays green, and two boxes on one host always agree. Replacing
   `ping.promise.probe` with `net.connect({host, port})` keyed on `host:port` fixes that _and_
   drops the `ping` dependency, the fork+exec per unauthenticated POST, an unhandled rejection when
   the `ping` binary is missing from a slim image, and an IPv6 bug
   (`new URL('http://[fd00::5]/').hostname` keeps the brackets).
3. **[app.html](src/app.html) destroys the server-stamped `scenery-paused` class** —
   `className = 'dark'` is a whole-attribute write, and the block that would re-add it is gated on
   the cookie being _absent_, which is false exactly when the server had reason to stamp it.
   **This is a straight port, not a design task**: copy `zenith/src/app.html`'s pre-paint script
   (`classList.remove(...%theme.default%)` / `add(...%theme.default-dark%)`, with its "swap only the
   classes this script owns" comment) plus the two module-scope
   `JSON.stringify(getClassesToAdd(…))` constants in `zenith/src/hooks.server.ts` and its two extra
   `.replace` calls — the same shape [hooks.server.ts](src/hooks.server.ts) already uses for
   `%theme%`. The import path adapts (`$lib/business/model/appearance` here). Behaviour is
   preserved: with no theme cookie the SSR-stamped class _is_ `fallow`, so `remove(['fallow'])` +
   `add(['dark'])` reproduces today's write minus the wipe; `%theme%` and `%theme.default%` can't
   collide, since the former needs its closing `%` immediately after `theme`. Landing this also
   **deletes the AGENTS.md invariant** that app.html hardcodes `DEFAULT_DARK_THEME`'s class — the
   placeholders remove the hand-mirroring — and retires assertion (4) of #29 entirely. Note
   [e2e/can-change-theme.spec.ts](e2e/can-change-theme.spec.ts) matches only `/dark/` and passes
   with the bug present; zenith's `not.toHaveClass(/fallow/)` is the assertion that catches it.
4. **"Resume animations" is dead under `prefers-reduced-motion`** — the CSS pauses with `!important`
   and no opt-out, so the button flips its label and nothing moves. Don't just skip rendering it on
   a one-time read: port zenith's `#prefersReducedMotion = $state(false)` in
   `business/store/theme-store.svelte.ts` — one unconditional `onMount` holding the
   `MediaQueryList`, a `sync()`, seeding only when `sceneryPaused === undefined`, an
   `addEventListener('change', sync)` and its teardown — plus the `sceneryMotionToggleable` getter,
   then gate the toggle in [+layout.svelte](src/routes/+layout.svelte) on it. Ours today registers
   that `onMount` **only** inside `if (initialSceneryPaused === undefined)`, so it never learns a
   mid-session flip, which is exactly what upstream's comment says the tracking is for. Don't copy
   the store wholesale — routing writes through `updateSceneryMotion` here where zenith calls the
   repository directly, and that routing is settled in AGENTS.md's "Already done".
5. **No keyboard path to any appearance control** — the dropdowns are hover-only, so
   `visibility: hidden` keeps all 27 theme buttons, both locales, reroll and the motion toggle out
   of the tab order. Two classes fix it:
   `group-focus-within:visible group-focus-within:opacity-100`, and
   [dropdown.svelte](src/lib/presentation/components/dropdown.svelte) already has the `group` parent
   they need. Note [e2e/dropdown.ts](e2e/dropdown.ts) hardcodes `.hover()`, so no current test can
   catch this. Nothing to port: zenith gets its keyboard path from bits-ui's `DropdownMenu`
   primitive, and AGENTS.md records dropping zenith's shadcn dependencies on purpose.
6. **box-date builds its `Intl` formatter at module scope from `getLocale()`**
   ([box-date.svelte](src/lib/presentation/components/box-date.svelte)) — the module body runs once
   per node process while the locale is per-request, so every SSR response is frozen to the first
   visitor's locale. Move it to instance scope.

## Storybook

7. **Storybook is installed with zero stories** — 8 devDeps, `.storybook/main.ts` + `preview.ts`,
   two npm scripts, and `main.ts` globs `../src/**/*.stories.@(js|ts|svelte)` which currently
   matches nothing. Write the stories rather than deleting the install. Good order, cheapest first:
   [box-date](src/lib/presentation/components/box-date.svelte) (no props) →
   [box-service](src/lib/presentation/components/box-service.svelte) (one story per `isOnline`
   state: `true` / `false` / `null`) →
   [box-adguard](src/lib/presentation/components/box-adguard.svelte) (with and without `stats`) →
   [dropdown](src/lib/presentation/components/dropdown.svelte) →
   [grid](src/lib/presentation/components/grid.svelte) /
   [sub-grid](src/lib/presentation/components/sub-grid.svelte) (nested containers; the interesting
   one). Notes for whoever picks this up:
    - Use the presentational components, **not** the wrappers — wrappers need a store in context,
      the components take plain props. This is the same split the unit tests already use, so the
      specs are the reference for prop shapes.
    - Theme classes live on `<html>`, so a story renders unstyled unless `.storybook/preview.ts`
      stamps a theme class on the root. Add a global decorator or a theme toolbar there.
    - `@storybook/addon-vitest` overlaps the existing vitest-browser project. Decide whether
      stories replace the component specs or sit beside them before adding more.
    - The theme decorator is a port, not a design task — see #32.
    - `eslint-plugin-storybook` is **already wired** in [eslint.config.js](eslint.config.js), at 0
      violations. Don't expect much from it: `flat/recommended`'s story globs are
      `**/*.stories.@(ts|tsx|js|jsx|mjs|cjs)` with no `.svelte`, so its 12 story rules will never
      fire on the `*.stories.svelte` files this repo intends to write. What it actually buys is
      `storybook/no-uninstalled-addons` on `.storybook/main.ts`, which also globs `../src/**/*.mdx`.

## Cleanup

8. **Wire a toast store into the `ErrorReporter` seam.** `ServicesStore` already accepts one and
   defaults to `console.error`, so a failed ping is reported rather than swallowed — but nothing
   shows it to the user yet. A `ToastStore` in `business/store/`, set in
   [+layout.svelte](src/routes/+layout.svelte), then `setServicesStore(toasts.report)` in
   [page.svelte](src/lib/presentation/components/page.svelte). `AppError.message` is guaranteed
   renderable, so the toast body is `error.message` and nothing else. Do the same for the AdGuard
   failure in [+page.server.ts](src/routes/[[slug]]/+page.server.ts), which still logs and returns
   `null` — the error is available, it just isn't forwarded to the page yet. Two producers are
   already logging-and-swallowing: +page.server.ts:19-22 and :33-37.
9. **Delete the browser cookie re-read in `ThemeStore`** (lines 88–96 + the `browser` import). The
   same cookie was already resolved through the same `resolveThemeName` to produce `data.theme` in
   the same request, so it can only ever equal what was handed in — while its early `return` makes
   the blocks below look conditional when they aren't. Unverifiable until #30's rune harness exists.
10. **`git rm --cached dps.js`** — unrelated gacha-game DPS math at the repo root that
    `npm run lint` currently walks. Same treatment for the two tracked inlang cache blobs
    (`project.inlang/cache/plugins/*`): `git rm --cached` them and add `project.inlang/cache/` to
    [.gitignore](.gitignore), as zenith's does — neither `.gitignore` nor `.prettierignore` has an
    inlang entry here at all.
11. **Re-seed scenery per theme group** so variable order stops being global. That deletes the
    second PRNG stream, the "must stay last" guard, and the call-count preservation in
    `dunesRidgesUrl`. Don't pin current output with a golden test — that freezes the invariant
    instead of removing it. **Zenith already did this; port it.** Copy `hashName` (FNV-1a) and
    `themeRandom(seed, name)` returning `{between, rem, sec, tile}` from
    `zenith/src/lib/presentation/utils/scenery-seed.ts`, its per-theme instantiations, and its
    single `vars` table. That deletes our `rnd2`/`between2` stream, the "must stay last" guard, the
    local-seed harvest inside `dunesRidgesUrl` and the `{...vars, ...vars2}` merge — exactly what
    this item asks for. Copy `scenery-seed.test.ts` with it: determinism, >90% of variables differ
    across seed pairs, no `NaN`/`undefined`/`Infinity`, SVG-url shape — it pins no output, so it
    satisfies the "don't freeze the invariant" constraint, and our `server` project already
    includes `*.test.ts`. Our variable set is zenith's minus three it doesn't have, none ours-only.
    Keep our ordering of the dunes pair and our header comment. Landing this deletes the
    two-PRNG-streams invariant from AGENTS.md, which already anticipates it.
12. **Two missing config warnings**: a non-integer `span` is dropped silently and falls back to full
    width, and a `defaults` key naming an unknown component never matches and never warns. Both
    write into #23's diagnostics channel — land that first.
13. **[src/hooks.ts](src/hooks.ts) is inert** — `reroute` de-localizes for route _matching_, then
    the load reads the still-localized path, so `GET /de/services` 404s. Unreachable today
    (`paraglide/runtime.js:35-39` is `strategy = ["cookie","globalVariable","baseLocale"]`, no
    `"url"`), but adding `"url"` for shareable language links makes _every_ page 404 in German.
    Delete it, or use `config.pages[deLocalizeUrl(url).pathname]`.

## Correctness & security (second review)

14. **Guard `normalizeConfig` inside `readConfig` and stop `defaults` from re-supplying children** —
    `S`
    `config-source.ts:43` calls `normalizeConfig(raw)` bare while both disk reads above it are
    Result-wrapped; `normalizeContainer` threads `defaults` into its own recursion
    (config.ts:147-152 → 169-173), so a `defaults` entry for `Grid`/`SubGrid` carrying `items`
    recurses forever. Wrap the call and fall back to `cache?.config ?? emptyConfig` like the two
    read failures, and delete structural keys (`items`) arriving from `defaultProps` at
    config.ts:150 (`defaults` is documented as per-container props, README.md:61).
    _Prevents:_ reproduced on the built server — `GET /` returns 500 twice in a row with SvelteKit's
    bare `Internal Error` shell (not `+error.svelte`), forever, because line 43 never completes so
    `cache` stays `undefined`; `+layout.server.ts:6` awaits the same function, so the header nav
    dies too. README.md:63 promises "a malformed container is dropped with a warning instead of
    breaking the page".
    _Files:_ src/lib/business/model/config-source.ts:43, src/lib/business/model/config.ts:147-173,
    src/routes/[[slug]]/page.server.spec.ts

15. **State `secure` explicitly on all three appearance cookies** — `S`
    Neither write path types it: `cookie.ts:41` omits the attribute, and `COOKIE_WRITE_OPTIONS`
    (cookie.ts:45-50) omits the key, so SvelteKit merges in its own default —
    `secure: url.hostname === 'localhost' && url.protocol === 'http:' ? false : true`. Derive it
    from `location.protocol` in the browser and the request URL on the server;
    `COOKIE_WRITE_OPTIONS` is `as const` and consumed as a type at appearance-repository.ts:69, so a
    per-request value widens that signature.
    _Prevents:_ on plain HTTP (`http://dashboard.lan`) the server-minted `scenerySeed`
    (appearance.ts:79-88) ships with `Secure`, the browser drops it, and it is re-minted on **every**
    response — scenery re-arranges on every navigation and the document is permanently unshareable.
    On HTTPS the inverse: the three browser-written cookies carry no `Secure`. Structurally invisible
    in dev and CI, which both hit `http://localhost` — the one exempt host (playwright.config.ts
    port 4173). Nothing to port: zenith omits `Secure` on both paths too, but it deploys to Vercel,
    which is HTTPS-only, so it never reaches the failure.
    _Files:_ src/lib/data/storage/cookie.ts:41,45-50,
    src/lib/data/repository/appearance-repository.ts:69,72, README.md

16. **Stop a dead AdGuard box from gating first byte: cache the stats with a short TTL, then refresh
    them** — `M`
    `+page.server.ts:52` is `adguard: await loadAdguardStats(page)` and nothing caches the result.
    Mirror config-source.ts:18's cache shape with a short TTL so at most one request per window pays
    the 3s bound (keep the bound), then add `depends('dashboard:adguard')` in the load and a
    visibility-gated `invalidate('dashboard:adguard')` interval in **src/routes/[[slug]]/+page.svelte**
    (reuse the setInterval + teardown shape at poll-services-state.ts:19-23). Note `invalidate`
    re-runs the whole load, so `readConfig` (mtime-cached) runs again too.
    _Prevents:_ measured with a blackhole href — `ttfb=2.996s` then `2.954s` on the second request,
    while a 404 on the same server answers in 0.005s; repository/adguard.ts:16-22's own comment says
    "it does not get to hold the other boxes hostage". Also unfreezes the only real-data widget,
    currently loaded once per navigation while the date box ticks at 1s and dots re-poll at 15min.
    _Files:_ src/routes/[[slug]]/+page.server.ts:42-54, src/lib/business/model/adguard.ts,
    src/routes/[[slug]]/+page.svelte

17. **Key AdGuard stats by href, and validate the wire shape before transforming** — `M`
    `loadAdguardStats` resolves `findContainer(page, 'BoxAdguard')` — first match at any depth — and
    `AdguardStore` holds one value that box-adguard-wrapper.svelte:11 hands to every instance without
    reading `props.href`. Add `collectAdguardHrefs` beside `collectServiceHrefs` (config.ts:253-267),
    `Promise.all` the fetches so the 3s bound stays 3s total, return `Record<href, AdguardStats>`, and
    make the store `stats(href)` (the wrapper edit is one line — `props.href` is already typed in).
    Separately, add a numeric check right after `raw.json()` in `getAdguardStats`, matching the
    existing `if (!raw.ok) throw …` pattern so `useAsyncErrorAsValue` turns it into the existing
    `AppError`.
    _Prevents:_ reproduced live — two BoxAdguard containers (`:4753` stubbed, `:4999` dead) both
    render `DNS queries: 1111 / Blocked: 222 / Delay: 11ms / first.example`, and `:4999` is never
    contacted or reported. And a 200 with the wrong body (`{"message":"unauthorized"}`) renders
    `DNS queries: undefined`, `Delay: NaNms` with nothing logged, while the same function already
    defends `top_blocked_domains?.at(0) ?? {}`.
    _Sequencing:_ the load's return type changes to a record, rippling into page.svelte:9-18 — land
    this before #16's refresh. Decide explicitly whether `findContainer` (config.ts:239-250) gets
    deleted; `+page.server.ts:11` is its only production caller. Cheap fallback if multi-instance is
    not wanted: warn on a second BoxAdguard via #23's channel (credentials are global —
    `+page.server.ts:17` reads one `ADGUARD_USERNAME`/`ADGUARD_PASSWORD` pair — so keying only
    supports instances sharing a login).
    _Files:_ src/routes/[[slug]]/+page.server.ts:11, src/lib/business/model/config.ts:253-267,
    src/lib/business/store/adguard-store.svelte.ts:12-20,
    src/lib/presentation/components/box-adguard-wrapper.svelte:11,
    src/lib/data/repository/adguard.ts:43-47, src/lib/presentation/components/page.svelte:18

18. **Re-poll service status on `visibilitychange` and `focus`** — `S`
    `pollServicesState` is 24 lines: one `poll()`, one `setInterval(poll, 15min)`, a teardown that
    only clears it. Add a `visibilitychange` handler calling the existing `poll()` when
    `document.visibilityState === 'visible'`, removed in the teardown the function already returns.
    Zenith listens on **both** `visibilitychange` and `focus` — take the pair, with the guarded,
    torn-down shape from its `session-store.svelte.ts` (its `today` store's listener is
    unconditional; we want the `!document.hidden` guard).
    _Prevents:_ timers do not fire while the OS is suspended and browsers freeze background tabs, and
    `setInterval` does not catch up — a resumed start-page tab asserts, with a green dot, a
    measurement that is hours old, and a recovered service stays red for up to 15 more minutes.
    `#states` is keyed by href (service-store.svelte.ts:19), so the extra poll overwrites rather than
    stacking. Grep confirms zero `visibilitychange` / `focus` / `online` listeners anywhere in src.
    _Files:_ src/lib/business/store/poll-services-state.ts:19-23,
    src/lib/business/store/poll-services-state.spec.ts (fake timers already installed at :27-60; the
    new case needs a `*.svelte.spec.ts` home or a stubbed `document`, since the node project has
    none)

19. **Widen `[[slug]]` to `[...slug]` and warn on `pages` keys without a leading slash** — `S`
    `+layout.server.ts:11-14` turns every `config.pages` key into a nav link with no validation, but
    the built route pattern is `/^(?:\/([^/]+))?\/?$/` — one segment, no slashes. Rename the route
    directory (a rest param still matches `/`, and the static `/api/ping` sorts ahead of it) and add
    a `normalizeConfig` warning for a key not starting with `/`.
    _Prevents:_ verified on the built server with keys `/media/plex` and `noslash` — `/media/plex`
    renders as a nav link and returns SvelteKit's generic `Not Found`, never reaching the configured
    `No dashboard page is configured for "…"` message; `noslash` emits a **relative**
    `href="noslash"` that resolves against whatever page the user is on. Also unblocks `/media/*`,
    `/network/*` page grouping.
    _Files:_ src/routes/[[slug]]/ → src/routes/[...slug]/, src/routes/+layout.server.ts:11-14,
    src/lib/business/model/config.ts

20. **Add a response-header `Handle` (Referrer-Policy, X-Content-Type-Options, X-Robots-Tag,
    Cache-Control), flip robots.txt, then enable CSP** — `M`
    There is no header layer: the three handles in hooks.server.ts:1-36 only do
    `transformPageChunk`, and `grep -rn setHeaders src e2e` returns nothing. One new `Handle` sets
    `Referrer-Policy`, `X-Content-Type-Options`, `X-Robots-Tag: noindex` and
    `Cache-Control: private, no-store`, and static/robots.txt (currently
    `# allow crawling everything by default` / `Disallow:`) flips to noindex. Then
    `kit.csp.directives` in svelte.config.js:9 — with two required accommodations:
    `<script nonce="%sveltekit.nonce%">` on the hand-written pre-paint script (app.html:12-26), and
    an explicit `'style-src-attr': ['unsafe-inline']`, because the app puts computed values in inline
    `style` **attributes** (box-service.svelte:34 `style={spanStyle(span)}` — the `--span` invariant;
    +layout.svelte:72 scenery; +layout.svelte:124,126 swatches) and SvelteKit's own nonced `<style>`
    nullifies `'unsafe-inline'` in `style-src`. Nothing sets `prerender`, so `mode: 'nonce'` is
    available.
    _Prevents:_ the page's content is an internal network map (hostnames, ports, inventory) typically
    published through a proxy, currently indexable, with the origin leaked to cdn.jsdelivr.net /
    cdn.simpleicons.org / raw.githubusercontent.com on every load (config.json:28,39,55,104; the
    `<a>` at box-service.svelte:33 carries `rel="noreferrer"`, the `<img>` at :43 carries no
    `referrerpolicy`). The `Cache-Control` half is the one that matters most: `GET /` returns German
    or English HTML purely on the `PARAGLIDE_LOCALE` cookie, plus a cookie-derived theme class and
    scenery-paused class (hooks.server.ts:20,32) and a `Set-Cookie: scenerySeed` on first visit —
    with no `Vary` and no cache directive. Client-side nav data is already safe (kit sets
    `private, no-store` on `__data.json`), so only the document needs it.
    _Nothing to port:_ zenith has no header `Handle`, no `kit.csp`, and no `Referrer-Policy` /
    `X-Content-Type-Options` anywhere; its only `Cache-Control` is `public, max-age=3600` on
    robots.txt and sitemap.xml, because it wants to be indexed — the opposite requirement.
    _Files:_ src/hooks.server.ts, svelte.config.js:9, src/app.html:12-26, static/robots.txt,
    src/routes/+layout.server.ts:21

21. **Fix the page's accessibility skeleton and land one axe e2e audit** — `M`
    In +layout.svelte: move `<header>` (:85) out of `<main>` (:82, closing :177) so it maps to
    `banner` instead of `generic` — the IntersectionObserver sentinel at :83 must move with it and
    the header currently inherits `main`'s `p-box-xl`; wrap the page links (:96-100) in `<nav>` and
    add `aria-current="page"` (needs `import { page } from '$app/state'`, which the layout does not
    have today); add a `<title>` to the `<svelte:head>` block (:61-63, currently only the favicon)
    composed from `m.app_title()` plus the configured page name from `data.pages` — no page in the
    app emits a title at all. Demote headings so the outline stops reading h1 → h3 → h5 → h3:
    grid.svelte:29/:33 and box-service.svelte:45 all need planning together. Then add
    `@axe-core/playwright` and one `e2e/is-accessible.spec.ts` scanning `/`, `/services`, `/nope` in
    both locales and with `colorScheme: 'dark'` (the `test.use` pattern exists at
    e2e/can-change-theme.spec.ts:32-33).
    _Payoff:_ an axe run against the real built page currently reports exactly three violations —
    `document-title`, `heading-order`, and `link-name` (serious): box-adguard.svelte:41 is an `<a>`
    whose only content is the stats paragraphs, so when `stats` is undefined the items array is empty
    (:18-21) and the live accessible name is `""`. `@storybook/addon-a11y` is already a dependency
    (package.json:29) running against zero stories (.storybook/main.ts:4 globs nothing), so axe is
    installed and audits nothing. Note the status dot's `aria-label` **does** surface in Chromium
    (measured: link name `"Loopback online"`), so the residual dot defect is WCAG 1.4.1 colour-only
    information, not a missing name — a non-colour cue, not an ARIA change.
    _Port only the nav half:_ take zenith's `nav.svelte` `<nav>` wrapper and its
    `aria-current={isActive(link.href) ? 'page' : undefined}` compared against
    `deLocalizeUrl(page.url).pathname`. Zenith has no `banner` landmark either — its `<nav>` also
    sits inside `<main>` — and its `<title>` comes from an 89-line `seo-head.svelte` built on
    canonical/hreflang/OG/JSON-LD and a `PUBLIC_SITE_URL`, which is the wrong shape for a noindex
    private dashboard. Do adopt the one idea zenith's `scripts/` teaches — both its contrast tools
    parse the theme catalogue rather than hardcoding a theme list, "because a hand-copied list
    silently stops covering new themes" — but apply it narrowly: parameterize **`color-contrast`
    only** over the 27-entry catalogue via the theme cookie and leave the other axe rules on one
    theme. Unqualified, the loop is 27 × 3 paths × 2 locales = 162 axe runs against an item scoped
    at 6. Don't create a `scripts/` directory for it: zenith's `ink-contrast.mjs` measures
    `bg-<state> text-<state>-ink` over 9 fills and we have no `-ink` token, and its
    `hover-contrast.mjs` drives a shadcn button story we have no equivalent of.
    _Files:_ src/routes/+layout.svelte:61-63,82-100,
    src/lib/presentation/components/grid.svelte:29,33,
    src/lib/presentation/components/box-service.svelte:45,
    src/lib/presentation/components/box-adguard.svelte:18-21,41,
    src/lib/presentation/components/grid.svelte.spec.ts:35, e2e/is-accessible.spec.ts (new),
    e2e/can-navigate-between-pages.spec.ts

## Architecture & extensibility

22. **Close the config→DOM prop spread and make the seam actually fail on a mismatch** — `M`
    AGENTS.md rests the "business owns the config format" decision on `{...container.props}`
    (config-container.svelte:39-47) erroring when a component prop stops matching the schema.
    Measured: it does not. Three parts: (a) drop `& HTMLAnchorAttributes` /
    `& HTMLAttributes<HTMLDivElement>` and remove the `{...restProps}` pass-throughs from the **six**
    components that carry them — box-service.svelte:18,30, box-adguard.svelte:16,42,
    box-date.svelte:22,37, grid.svelte:17,21, plus dropdown.svelte:15,18 and sub-grid.svelte:6,10;
    `sub-grid` re-uses `grid`'s `Props`, so dropping grid's `& HTMLAttributes` ripples into it, and
    `dropdown`'s pass-through is provably dead (+layout.svelte:103 passes only `panelClass`, :153
    passes nothing, so `restProps` and the `restProps.class` read at :18 have no source) — verified no
    caller depends on any of them (svelte-check stays at 0); (b) add an allowlist of schema-declared prop
    keys next to `requiredProps` (a `Record<ContainerName, readonly string[]>`, same compile-time
    completeness) and warn on unknown keys, reusing the `STYLE_KEYS` phrasing at config.ts:156; (c) add
    the check the spread cannot give you — an
    `Equals<ConfigContainer<'BoxService'>['props'], Omit<ComponentProps<typeof BoxService>, 'isOnline'>>`
    assertion in a spec. While in config.ts, derive the two hand-written nesting lists:
    `type NestingName = Extract<Container, { props: { items: Container[] } }>['name']`,
    `CONTAINS_CHILDREN: Record<NestingName, true>` (config.ts:129 is a plain `ContainerName[]`), and
    `isGrid` (config.ts:81-83) off that record.
    _Payoff:_ measured — renaming BoxService's `title: string` to `heading?: string` with a default
    keeps svelte-check at 0 errors and silently turns config's `title` into the `<a>` tooltip while
    every service box renders an empty heading (a _required_-prop rename does error, so this is the
    one escape). Independently, config.json currently injects arbitrary global HTML attributes
    (`title`, `id`, `hidden`, `tabindex`, `data-*`) onto real DOM nodes because props stays
    `Record<string, unknown>` (config.ts:149,186) and only `class`/`gridClass` are stripped — and a
    misspelled _optional_ prop (`spann: 6`, `subTitel`) renders wrong with no diagnostic. Adding a
    third nesting container today gets 2 of 4 compile prompts; `CONTAINS_CHILDREN` and `isGrid` are the
    two silent ones, and missing them means children are never normalized (a BoxService without `img`
    then 500s SSR) and `collectServiceHrefs` skips the subtree. Verified: the derived
    `Record<NestingName, true>` errors TS2741 where the array form compiles silently. Not an
    injection vector — Svelte's SSR renderer skips `on*` attributes.
    _Files:_ src/lib/presentation/components/{box-service,box-adguard,box-date,grid}.svelte,
    src/lib/business/model/config.ts:81-83,112-129,149-186, src/lib/business/model/config.spec.ts

23. **Give config loading a return channel: diagnostics as values, `GET /api/health`, one log per
    mtime** — `M`
    `normalizeConfig` reports drops with four `console.warn`s from inside a framework-free model file
    (config.ts:136,142,156,178) and `readConfig` `console.error`s and discards its `AppError`
    (config-source.ts:25-41) — both violate the errors-as-values contract in AGENTS.md. Return them:
    `normalizeConfig(raw): { config, warnings }`, and `readConfig` handing back the last-good config
    plus the problems it hit; keep the retained error beside the cache and add `GET /api/health`
    returning 200 with page count + config mtime, or 503 with the message.
    _Prevents:_ measured with a trailing comma in config.json — every page 404s with
    `No dashboard page is configured for "/"`, a message that blames the URL, while the real cause is
    written only to stdout as **two** full SyntaxError stack traces _per request_ (55 log lines for 3
    requests; `+layout.server.ts:6` and `+page.server.ts:43` both call `readConfig`, and
    config-source.ts:31's mtime short-circuit never engages because the failing branch never populates
    `cache`). Worse, the log never names the file: the operator sees
    `Unexpected token '}' … is not valid JSON` with no path, because the thrown message wins over the
    fallback at src/lib/data/config.ts:29. No health/readiness route exists for a systemd
    `ExecStartPost` or compose `HEALTHCHECK`.
    _Unlocks a lint rule:_ once this and #8 land, `no-console` becomes enableable with only
    `[[slug]]/+page.server.ts` and `service-store.svelte.ts`'s default reporter exempted — 10 sites
    now, 3 after, one of which is #10's `dps.js`. Don't reach for zenith's answer to get there: a
    root `logger.ts` plus `no-console: 'error'` everywhere is a fourth module below all three layers,
    and it collides with the errors-as-values / injected-`ErrorReporter` contract AGENTS.md records as
    deliberate. If a logger is ever genuinely needed here it goes in `src/lib/utils/` and needs **no**
    new lint rule — `leaf-not-to-upper-layers` already fences that directory. Zenith needed a
    root-level file and a bespoke `logger-imports-nothing` rule precisely because it has no leaf.
    _Sequencing:_ #12's two warnings write into this channel — land this first. `config.spec.ts`'s
    `pageWith` helper already returns `{ page, warn }`, so those assertions are a mechanical rewrite;
    page.server.spec.ts:54-58 needs a new case separating unreadable-config from unknown-path.
    _Files:_ src/lib/business/model/config.ts:136-178, src/lib/business/model/config-source.ts:20-45,
    src/lib/data/config.ts:29, src/routes/[[slug]]/+page.server.ts:43-48,
    src/routes/api/health/+server.ts (new)

## Features

24. **Add a `BoxSearch` container: a config-driven GET search form, no server code** — `M`
    Add `'BoxSearch'` to `CONTAINER_NAMES` (config.ts:15), a `requiredProps.BoxSearch` entry
    (config.ts:112-127 is a `Record<ContainerName, …>`, so this is compile-mandatory), and one branch
    in config-container.svelte's if/else chain (:38-52, ending in the `never` assert). Props: `href`
    (required), optional `placeholder`; renders `<form action={href} method="get"><input name="q">`
    — hardcode `q` (Whoogle, SearXNG, Google, DuckDuckGo all use it). Add a `/`-key focus handler and
    the two new message keys to **both** messages/en.json and messages/de.json (16-keys-in-sync
    invariant).
    _Payoff:_ the page is currently read-only — `grep -rniE "search|<form|<input" src e2e` returns
    zero matches — so the first thing a user does after loading their start page is leave for the
    address bar. The target is already self-hosted: config.json:227-228 links Whoogle at
    `http://192.168.178.192:5000/` as a click-through.
    _Files:_ src/lib/business/model/config.ts:15,112-127,
    src/lib/presentation/components/config-container.svelte:38-52,
    src/lib/presentation/components/box-search.svelte (new), messages/en.json, messages/de.json,
    README.md:63-66

25. **Add a `BoxBookmark` container so link-only boxes stop being probed** — `S`
    Same three edit points as #24 (`CONTAINER_NAMES`, `requiredProps`, one config-container branch):
    `title` required, `img.src`/`subtitle` optional, no status dot, no store. Because
    `collectServiceHrefs` (config.ts:253) walks only `isBoxService`, a bookmark is automatically
    excluded from the poll set and from `/api/ping`'s allowlist (api/ping/+server.ts:23) — zero
    changes to the probing path. Then migrate the one offending config entry.
    _Payoff:_ BoxService is the only link container and it demands `title` + `href` + `img.src`
    (config.ts:114-120), renders the status `<span>` unconditionally (box-service.svelte:47-54 —
    `bg-primary` + `aria-label="status unknown"` forever), and gets POSTed every 15 minutes
    (`POLL_INTERVAL_MS`, poll-services-state.ts:5). config.json:32-42 abuses it for `tteck` →
    `https://community-scripts.github.io/ProxmoxVE/`, so the server probes GitHub Pages four times an
    hour to paint a meaningless dot. Prefer a new name over a `probe: false` flag: a flag would force
    `collectServiceHrefs` and the ping allowlist to start reading props.
    _Files:_ src/lib/business/model/config.ts:15,112-127,
    src/lib/presentation/components/config-container.svelte:38-52,
    src/lib/presentation/components/box-bookmark.svelte (new), config.json:32-42, README.md:63-66

26. **Add `preferredLanguage` to the Paraglide strategy, then localize the AdGuard counters** — `M`
    `paraglide/runtime.js:35-39` is `strategy = ["cookie", "globalVariable", "baseLocale"]` and
    vite.config.ts:11-14 passes only `project`/`outdir`, so a `de-DE` browser gets English on the
    first SSR response and only reaches German by clicking the dropdown — and there is no way to link
    a locale. Adding `preferredLanguage` also makes `test.use({ locale: 'de-DE' })` a usable e2e
    lever. Then run the two counters through `Intl.NumberFormat(getLocale())` at **instance** scope
    (same per-request reason as #6): box-adguard.svelte:24,26 pass raw numbers and the compiled
    message is `` `DNS-Anfragen: ${i?.count}` ``.
    _Payoff:_ closes the first-render locale gap in a deliberately bilingual app, and `43871` becomes
    `43.871` in German. No test today can tell German output from English:
    box-date.svelte.spec.ts:20 matches `/\d{1,2}:\d{2}:\d{2}/` (true in every locale),
    box-adguard.svelte.spec.ts:31-45 compares against `m.*()` so it auto-follows any format change,
    and e2e cannot render a populated AdGuard box (fixture-config.json:12 points at closed port
    9999). Assert it in box-adguard.svelte.spec.ts against a literal string — the compiled message
    accepts `{ locale: 'de' }`.
    _Files:_ vite.config.ts:11-14, src/lib/presentation/components/box-adguard.svelte:24-34,
    src/lib/presentation/components/box-adguard.svelte.spec.ts

## Ops & DX

27. **Ship a production invocation that actually loads `.env`, and document the AdGuard contract** —
    `S`
    README's production path is `npm run build && node build` (README.md:20-21), but adapter-node
    reads only `process.env` (build/env.js; `grep -c dotenv build/index.js` = 0) — so
    `ADGUARD_USERNAME`, `ADGUARD_PASSWORD` and `DASHBOARD_CONFIG` are all silently absent in
    production while working in dev. Document `node --env-file=.env build` (Node ≥20.6), an
    **absolute** `DASHBOARD_CONFIG` (src/lib/data/config.ts:16 resolves from the process CWD at
    module scope), and a systemd unit (`EnvironmentFile=`, `WorkingDirectory=`) or compose file with
    the config bind-mounted. Add `engines: { node: ">=20.6" }` so `.npmrc:1`'s `engine-strict=true`
    stops being inert. In the same README pass, name the two AdGuard variables (they appear
    **nowhere** in README.md or AGENTS.md — only `.env.example` and `+page.server.ts:17`), state that
    they are runtime `$env/dynamic/private`, describe the one degradation with two causes
    (credentials absent → +page.server.ts:19-22; box unreachable/401 → :33-37, both `console.warn` +
    `return null` = an empty box with no user-visible reason), and mention the 3s
    `AbortSignal.timeout` (repository/adguard.ts:38).
    _Prevents:_ measured — `node ./build` with a populated `.env` logs
    `ADGUARD_USERNAME / ADGUARD_PASSWORD are not set, skipping AdGuard stats` and answers in 33ms;
    `node --env-file=.env build` resolves them and takes 2.98s attempting the fetch. #1's own
    mitigation ("Point `DASHBOARD_CONFIG` at it", README.md:74) cannot work as documented until this
    lands.
    _Files:_ README.md:13-22,63-74, package.json, .env.example,
    deploy/revie-dashboard.service or compose.yaml (new)

28. **Add CI, and point Playwright's `webServer` at the shipped artifact** — `S`
    One workflow running `npm run check`, `npm run lint` (which chains `lint:deps`),
    `npm run test:unit -- --run` and `npm run test:e2e`, with
    `npx playwright install --with-deps chromium` — needed by the e2e suite **and** by the vitest
    `client` project, which uses a real Chromium (vite.config.ts:26-29). In the same pass change
    playwright.config.ts:5 from `npm run build && npm run preview` (i.e. `vite preview`) to
    `node build` with explicit `PORT=4173` and the existing
    `DASHBOARD_CONFIG: 'e2e/fixture-config.json'`.
    _Start from zenith's `.github/workflows/ci.yml`_, which has two things this item didn't: a
    `permissions: contents: read` + concurrency block with `cancel-in-progress` on non-main, and an
    `actions/cache@v4` on `~/.cache/ms-playwright` keyed by the resolved Playwright version (an
    `id: playwright` step) — the browser is needed twice here, so the cache pays twice. Drop its
    `depcheck` step (our `lint` already chains `lint:deps`) and its chromatic job
    (`@chromatic-com/storybook` is a dependency here but would snapshot zero stories). `npm run check`
    now chains `npm run paraglide`, so a clean checkout no longer fails on 13 unresolved modules.
    _Payoff:_ there is no `.github/` and no workflow, Dockerfile, compose, Makefile or any `.yml` in
    the 124 tracked files — five gates and AGENTS.md's "`lint:deps` … is at **0 errors**; keep it
    there" declaration rest on the author remembering. And everything under build/ — the artifact
    that ships — is exercised by nothing: the Playwright command builds it and throws it away. That
    runtime split (own CWD/env resolution at src/lib/data/config.ts:16, ORIGIN-derived CSRF check
    that the `POST /api/ping` tests at e2e/can-see-service-status.spec.ts:23-34 depend on,
    sirv/compression instead of Vite) is structurally why the `.env` divergence in #27 went
    unnoticed; assert the ping POST still behaves under it. Optional: fail on a `npm run depgraph`
    diff (needs graphviz `dot`) — the committed dependency-graph.svg is **not** currently stale
    (68e35c9 is the last commit touching both it and src/).
    _Files:_ .github/workflows/ci.yml (new), playwright.config.ts:4-6, package.json:11-21

29. **Add two drift-fence node specs: the four hand-mirrored invariants, and doc links** — `M`
    One spec reading the real files with `node:fs` (the `server` project at vite.config.ts:35-43 is
    the home; no spec anywhere reads a real file today — config-source.spec.ts _mocks_
    `node:fs/promises`). Assert: (1) `messages/en.json` and `messages/de.json` have identical key sets
    (17 each incl. `$schema`); (2) the `--spacing-*` names in tokens.css:46-86 (28) equal the spacing
    array in style.ts:12-41 (28) — exporting that array out of the inline `extendTailwindMerge` call
    is part of the work; (3) every `css` class of every one of the 27 `themes` entries has a palette
    selector in themes.css (25) or base.css (`.solid-light`:19, `.dark`:183), and an
    `@custom-variant` in tokens.css **except** `solid-light`. There is no assertion (4): #3's port
    replaces app.html's hardcoded class with `%theme.default%` placeholders filled from the catalogue,
    so after it lands there is no hand-mirrored token left to fence. Second spec: extract every
    `](relative/path)` from AGENTS.md, README.md, roadmap.md, CLAUDE.md, strip any `#L…`, assert
    `existsSync`, and assert every `#L<n>` is within the file's line count.
    _Payoff:_ (1) is the highest-value and the reason this ranks here: AGENTS.md and README.md
    claimed a missing translation fails the build, and it does not — verified by removing a `de` key
    and running the compiler: it succeeds and emits `const de_theme_label = en_theme_label;`, so a
    deleted `de` key ships German pages rendering English with no build and no svelte-check error.
    (AGENTS.md and README.md now say the truth; this is the fence that keeps them true.) The others
    are the failures AGENTS.md's Invariants section classifies as "break silently": a theme with no
    palette renders the app unstyled, a drifted spacing entry makes `cn()` keep both conflicting
    classes. style.spec.ts covers only `cn`/`spanStyle`/`normalizeSpan`; theme.spec.ts:11-27 checks
    uniqueness and labels, never that any CSS exists. And the doc spec is worth having because
    `npx prettier --check .` and `npx depcruise src` were both green while three AGENTS.md links
    404'd — one refactor commit produced all three, and nothing noticed for two commits. Every doc
    link resolves as of now, so the fence lands green.
    _Nothing to port — verified:_ zenith has no drift fences at all. Its `cn` is plain
    `twMerge(clsx(inputs))` with no `extendTailwindMerge` anywhere, so it has no spacing mirror and no
    protection against a drifted spacing class either; one of its specs reads a real file, nothing
    reads its `de.json`, and no doc-link check exists. Don't go looking upstream for this one.
    _Files:_ src/lib/utils/style.ts:12-41, src/lib/utils/style.spec.ts,
    src/lib/business/model/theme.spec.ts, src/lib/test/invariants.spec.ts +
    src/lib/test/docs.spec.ts (new)

30. **Cover `business/model/appearance.ts`, and build the repo's first rune harness for
    `ThemeStore`** — `M`
    Neither has a spec while everything around them does (theme.spec.ts,
    appearance-repository.spec.ts, page.server.spec.ts). (1) appearance.ts is pure and node-testable
    with the `from(jar)` fake at appearance-repository.spec.ts:11 — but that fake implements only
    `get`, and `readOrMintScenerySeed`'s parameter is
    `CookieSource & Parameters<typeof $createScenerySeedCookie>[0]` (appearance.ts:79-81), so it needs
    a spied `set` to assert the no-second-mint path (:83) alongside the deleted-theme guard (:38 —
    non-empty `themeClass`, `theme: undefined`). (2) ThemeStore's constructor registers `$effect`s
    (:63,:68) **and** calls `onMount` (:75,:107), so it cannot be instantiated from a plain spec;
    write `src/lib/test/theme-store-harness.svelte` driven from a `*.svelte.spec.ts`
    (vite.config.ts:31 includes only that pattern) and cover the three-source reconciliation: cookie
    beats the SSR seed (:88-96), an unknown SSR theme falls through to defaults (:99-116),
    `initialSceneryPaused === undefined` honours `prefers-reduced-motion` (:74-84), and each setter
    mirrors to the cookie.
    _Payoff:_ AGENTS.md calls ThemeStore the subtlest machinery in the app and #9 asks someone to
    delete lines 88-96 of it — with zero tests that edit is unverifiable, and a regression renders the
    app unstyled or shifts the SSR'd scenery on hydration. The harness is reusable for any future
    rune-constructor store (adguard-store.svelte.ts, scenery-seed.ts, scenery-time.ts,
    hooks.server.ts, data/config.ts and data/storage/cookie.ts also have no siblings).
    _Files:_ src/lib/business/model/appearance.spec.ts (new),
    src/lib/test/theme-store-harness.svelte +
    src/lib/business/store/theme-store.svelte.spec.ts (new)

## Upstream drift (the `zenith` ports)

Everything else portable from zenith maps onto an item above — see #3, #4, #10, #11, #18, #21, #28.
These two are new.

31. **Retire the self-referential `--color-x: var(--color-x)` idiom in `tokens.css`** — `M`
    17 `@theme` entries alias themselves: the four `--color-ty-*` (tokens.css:98-101),
    `--color-line-soft` (:111), `--color-danger|-warning|-success|-info` with their `-strong` pairs
    (:117-124), and `--color-brand|-strong` (:126-127). `--blur` (:88) and `--radius` (:95) stay —
    they are the two documented exceptions and zenith keeps them too. Rename the other 15 to alias
    the **unprefixed** name upstream uses (`--color-danger: var(--danger)`) and rename the matching
    declarations in base.css and themes.css. Safe: the only raw `var()` uses outside `style/` are
    +layout.svelte:124,126, which already name `--surface-page` / `--primary`, and the generated
    utility names (`bg-danger`, `text-ty-primary`) don't change. tokens.css:104-111 already does it
    the right way for surfaces and borders, so this finishes a job rather than starting one.
    _Payoff:_ diffability against zenith, which AGENTS.md asserts as an invariant and this breaks.
    Measured with `diff`: themes.css has **230** ours-only lines today, **125** after these 15
    renames. Getting to ~35 needs five more that are not `@theme` entries at all —
    `--color-mind|-mind-strong|-body|-flow|-mixed`, another 90 lines — which tokens.css:128-131
    claims it leaves alone so "those files stay a straight copy of upstream". They don't. The
    remainder is prettier at `tabWidth: 4` and not worth a config override.
    _Not a silent-breakage risk, and don't write it up as one._ Measured in the shipped CSS: the
    self-reference sits inside `@layer theme{…}` while base.css's real
    `--color-danger: var(--color-red-600)` is **unlayered** (`:root, .solid-light`), and an unlayered
    declaration outranks a layered one whatever the source order — tailwind emits the whole `@theme`
    block at the `@import 'tailwindcss'` position, not at tokens.css's. Rebuilt with app.css's import
    order flipped: byte-identical for every `--color-*`. It is a confusing idiom and 105 lines of
    diff noise; that is the whole case.
    _Files:_ src/lib/presentation/style/tokens.css:98-127,
    src/lib/presentation/style/base.css, src/lib/presentation/style/themes.css

32. **Port zenith's `.storybook/preview.ts`** — `S`
    Copy it over [.storybook/preview.ts](.storybook/preview.ts) (14 lines, controls matchers only).
    Two edits: `presentation/utils/scenery-seed` → `presentation/util/scenery-seed` and the same for
    `scenery-time`, since this repo's directory is singular. Then `npm run format` — though far less
    of a rewrite now that `.prettierrc` is `trailingComma: "all"`, which upstream already matches.
    Set `a11y: { test: 'todo' }`, not upstream's `'error'`. Everything it imports already exists here
    under the same name — `themes`, `DEFAULT_THEME`, `getClassesToAdd`, `ThemeName`, `sceneryStyle`,
    `dataSceneryStyle` — and the `.theme-scenery` + `theme-helper-1..4` DOM its `mountScenery()`
    builds is byte-for-byte +layout.svelte:69-78. Skip its `viteFinal`: nothing here reads
    `$env/dynamic/public`, so upstream's env stub is dead weight.
    _Payoff:_ answers the open question in #7 ("theme classes live on `<html>`, so a story renders
    unstyled") with a file that already works, and makes "does this need `backdrop-blur`?" — now an
    invariant in AGENTS.md — a question a story can answer, over the real decorative layer at a fixed
    seed. `'error'` would be dishonest twice: there is no storybook vitest project yet
    (vite.config.ts defines only `client` and `server`, where zenith wires `storybookTest`), so
    nothing consumes the parameter; and two of #21's three live axe violations are component-level, so
    the first two stories would fail for a defect they didn't introduce. Flip to `'error'` when #21
    lands **and** #7's third bullet has settled the runner.
    _Files:_ .storybook/preview.ts, #7

## Sequencing

The order that matters, beyond the group ranking:

- **#23 before #12** — item 12's two warnings need the diagnostics channel to write into.
- **#27 before #1** — item 1's documented mitigation ("point `DASHBOARD_CONFIG` at it") is inert
  until `.env` is actually loaded in production.
- **#25 before or with #2** — item 2 becomes strictly _more_ dangerous without it: `net.connect` on
  `host:port` would open a real TCP connection to community-scripts.github.io four times an hour
  (config.json:32-42 + POLL_INTERVAL_MS 15min). Move that entry to a bookmark first.
- **#17 before #16** — #17 changes the load's return type to a record, rippling into
  page.svelte:9-18.
- **#30 before #9** — the `ThemeStore` edit is unverifiable without a rune harness.
- **#3 before #29** — #3 replaces app.html's hardcoded class with catalogue-filled placeholders, so
  #29 has one fewer assertion to write. Doing them the other way round means writing a fence for a
  mirror that is about to disappear.
- **#3 and #4 touch the same two files** (app.html + `theme-store.svelte.ts`'s reduced-motion path)
  and are both zenith ports — land them together and diff once against upstream.
- **#32 before #7's first story** — without the theme decorator every story renders unstyled, which
  is #7's own third bullet.
- **#3 vs #29** — #3 rewrites app.html:17, so #29's assertion must parse class tokens rather than
  string-match `className = 'dark'`.
- **#7 and #21 are complementary**, not substitutes. `@storybook/addon-a11y` is installed
  (package.json:29) and globs zero stories (.storybook/main.ts:4), but landmarks, heading order
  across the config recursion, and the 27 theme palettes only exist on the composed,
  server-rendered page — which only the axe e2e audit sees.
