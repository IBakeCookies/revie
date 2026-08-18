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

33 is the exception to all of that: it came from asking why nothing here proposes new service
integrations, so it is the one item no review pass produced, and the one whose external API details
are not verified against this repo. It says so in place.

**Numbers are stable, so gaps mean landed.** 11 items are open — 10 from the review passes, plus #33
above, which came from asking what no review pass had proposed; **1, 2, 3, 4, 5,
6, 7, 8, 9, 11, 13, 14, 16, 17, 19, 23, 24, 25, 26, 30, 31, 32, 34, 35 and 36 are done** — the decisions worth not reverting moved into AGENTS.md's "Already done" and Invariants, and
the rest of the numbering stays put so the cross-references below keep resolving. A landed item
_inside_ a numbered list has to stay a numbered item, as #11 does: **prettier renumbers ordered
lists**, so deleting one and leaving a hole silently pulls every later item up by one on the next
`npm run format` — measured, #12 became #11 while the "#23 before #12" sequencing note still said 12.
Where a whole section emptied (#5, #7, #31, #32) the note sits at section level, which is safe
because there is no list left to renumber.

**Two names below are stale everywhere they appear, and the replacement is the same each time.**
`CONTAINER_NAMES` and `requiredProps` no longer exist: `business/model/config.ts` now declares one
valibot `containerSchemas` object and infers every config type from it, so an item that says "add
the name to `CONTAINER_NAMES` and a `requiredProps` entry" means **add one `v.object` entry to
`containerSchemas`** — which is also what makes it a compile error to register a container without
deciding what it needs. The second edit point, `config-container.svelte`'s `if/else` chain, is
unchanged and still required. Line numbers cited against `config.ts` predate the migration; the
names still resolve.

## Correctness

_(#5 — "no keyboard path to any appearance control" — landed. The panel carries
`group-focus-within:visible group-focus-within:opacity-100`
([dropdown.svelte:39](src/lib/presentation/components/dropdown.svelte#L39)) beside the wrapper's
`focus-within:z-20`, so focusing a trigger opens it and the next Tab lands on the first option —
all 27 themes, both locales, reroll and the motion toggle are back in the tab order. Two tests hold
it, both verified to fail with those two classes removed: the "Opens on keyboard focus" story
([dropdown.stories.svelte](src/lib/presentation/components/dropdown.stories.svelte)) and
[can-change-theme.e2e.ts:45](e2e/can-change-theme.e2e.ts#L45), which is the only one that sees the
composed header. [e2e/dropdown.ts](e2e/dropdown.ts) still hovers on purpose — it is the pointer
path. Nothing was ported: zenith gets its keyboard path from bits-ui's `DropdownMenu`, and AGENTS.md
records dropping zenith's shadcn dependencies deliberately.)_

## Storybook

_(#7 — "Storybook is installed with zero stories" — landed in the zenith parity pass. Every
component has a `*.stories.svelte` beside it whose play functions run as tests in a third
vitest project — 12 of each since #24 added `BoxSearch`. See AGENTS.md's "Already done".)_

## Cleanup

8. _(**Wire a toast store into the `ErrorReporter` seam** — landed, then corrected.
   [toast-store.svelte.ts](src/lib/business/store/toast-store.svelte.ts) is set in
   [+layout.svelte](src/routes/+layout.svelte) and rendered by
   [toasts.svelte](src/lib/presentation/components/toasts.svelte), an `aria-live` region kept in
   the DOM while empty so its first message is announced. Both producers report.
   **The item's own instruction — "the toast body is `error.message` and nothing else" — was
   wrong and was NOT followed.** `AppError.message` is minted in `data`, which has no locale, so
   that shipped an English toast on a German page. `ErrorReporter` is gone: `ServicesStore` takes
   `NotifyProbeFailed = (href: string) => void` and logs the message itself, the load returns
   a failure flag (a keyed list since #33), and `[...slug]/+page.svelte` picks the paraglide
   message. Ported from
   zenith, which has no language problem for exactly this reason — its seams are `() => void` and
   its variants are kinds. Five shape decisions plus the `untrack` trap are in AGENTS.md's
   "Already done"; the no-copy-crosses-a-layer rule is under "Errors are values". What this did
   NOT do: the credentials-absent branch still only warns, an unconfigured box being an absence
   rather than a failure, and the three `console` calls on this path are now permanent by
   design — #23 covers the seven that are not.)_
9. _(**Delete the browser cookie re-read in `ThemeStore`** — landed, and it took the whole read
   path with it. The store reconciles two sources now, and AGENTS.md's appearance pipeline says so.
   **The item's own line numbers were wrong and following them literally would have broken the OS
   leg:** :99–109 of the pre-edit file were the `prefers-reduced-motion` seeding `if`, the
   `addEventListener` and the `onMount` teardown, and #30 cited a third range (:88–96) for the
   same deletion. The block that actually went was the `cookie` read, `seededPaused`, the two
   `cookie?.` fallbacks and the early-returning `if (cookie?.theme)`. **Its blocker was stale too**
   — #30's harness, `theme-store.svelte.spec.ts` and `appearance.spec.ts` all existed by the time
   this ran. What the item did not foresee: `readClientAppearance` and `ClientAppearance` had no
   other reader, so they are gone from `business/model/appearance.ts`, `$readAppearance`'s
   `= documentCookies()` default lost its last caller, and `documentCookies` is deleted from
   [cookie.ts](src/lib/data/storage/cookie.ts) — `CookieSource` is now server-only, over
   `event.cookies` alone, and the two specs that covered the browser jar went with it.
   *Accepted behavioural loss:* a theme switched in another tab while this one is loading no longer
   snaps in on hydration — the tab keeps the server-stamped theme until its next full load, which
   is what `hooks.server.ts` had already painted, so the paint is consistent instead of flipping
   mid-hydration.)_
10. **`git rm --cached dps.js`** — unrelated gacha-game DPS math at the repo root that
    `npm run lint` currently walks. Same treatment for the two tracked inlang cache blobs
    (`project.inlang/cache/plugins/*`): `git rm --cached` them.
    _Half landed in the zenith parity pass:_ `project.inlang/cache/` is now in
    [.gitignore](.gitignore), as zenith's is — but the blobs were already tracked, so the line is
    inert until the `git rm --cached` actually runs. `dps.js` is still tracked.
11. _(**Re-seed scenery per theme group** — landed, ported from zenith. `hashName` (FNV-1a) and
    `themeRandom(seed, name)` are in
    [scenery-seed.ts](src/lib/presentation/util/scenery-seed.ts), one stream per theme, one `vars`
    table. Gone with them: the `rnd2`/`between2` stream, the `{...vars, ...vars2}` merge, the "must
    stay last" guard on `--meridian-ribbons`, and the local-seed harvest inside `dunesRidgesUrl`,
    which now draws from the dunes stream. The 11 stream names are the 11 scenery files that read a
    seeded var, verified one-to-one, and each spells a real `ThemeName`. Our ordering of the dunes
    pair is kept, so `--dunes-ridges` draws before `--dunes-shimmer-phase-1` where zenith's is the
    other way round — self-consistent either way now that order is per-theme. `revie` is ours-only,
    so it got a stream zenith has no counterpart for; zenith's `zenith` and `polaris` vars were not
    ported, having no scenery here. Zenith's test came with it as
    [scenery-seed.spec.ts](src/lib/presentation/util/scenery-seed.spec.ts) — 12 cases, `.spec.ts`
    not `.test.ts` because all 19 node specs in this repo are `.spec.ts` and AGENTS.md's
    Conventions say so. It pins no output, as the item required. The two-PRNG-streams invariant is
    out of AGENTS.md, replaced by the per-theme one and its rename caveat.)_
12. **Two missing config warnings**: a non-integer `span` is dropped silently and falls back to full
    width, and a `defaults` key naming an unknown component never matches and never warns. Both
    write into #23's diagnostics channel — land that first.
13. _(**`src/hooks.ts` is inert** — landed as the deletion. The file is gone, and
    [eslint.config.js](eslint.config.js)'s presentation block narrowed from `src/hooks*.ts` to
    `src/hooks.server.ts` with it, so the glob no longer covers a file that does not exist.
    **The item's second option was deliberately NOT taken:** rerouting to
    `config.pages[deLocalizeUrl(url).pathname]` buys localized URLs, and nothing asked for them
    — the strategy #26 shipped resolves the locale from the cookie and the browser preference,
    so no path is ever localized and a `reroute` has nothing to de-localize. Bring the file back
    with the load-side half if `"url"` ever joins the strategy for shareable language links.
    Its own strategy citation had also gone stale independently: the generated runtime reads
    `cookie globalVariable preferredLanguage baseLocale` since #26.)_

## Correctness & security (second review)

14. _(**Guard `normalizeConfig` inside `readConfig` and stop `defaults` from re-supplying
    children** — landed. `STRUCTURAL_KEYS = ['items']` is stripped from every `defaults` entry,
    with a warning naming the key and the container, **once at the root of `normalizeConfig`**
    rather than inside `normalizeContainer` — so the container merge receives defaults it can
    trust and one offending entry reports once instead of once per Grid on the page. Reproduced
    before the fix (`RangeError: Maximum call stack size exceeded`) and fenced by two cases in
    [config.spec.ts](src/lib/business/model/config.spec.ts): the drop, and the warning count with
    two Grids inheriting one entry. **Only the `defaults` vector is closed:** `config-source.ts:100`
    is still un-wrapped and `normalizeConfig` still throws `RangeError` on nesting the FILE itself
    declares, around depth 2000. `STRUCTURAL_KEYS` is deliberately **not** derived
    from the schema types: that derivation is #22's scope. Recorded in AGENTS.md under
    "Config-driven rendering".)_

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

16. _(**Stop a dead AdGuard box from gating first byte: cache the stats with a short TTL, then
    refresh them** — landed, and renamed by #33. `readStats` in
    [stats.ts](src/lib/business/model/stats.ts) now holds a `Map<key, { readAt, result }>` at
    module scope behind a 30s TTL and returns `{ result, isFresh }`, the same seam `ConfigRead`
    uses; the client half is `depends('dashboard:stats')` in the load plus a 60s
    `invalidate('dashboard:stats')` interval in
    [+page.svelte](src/routes/[...slug]/+page.svelte).
    Fenced in [stats.spec.ts](src/lib/business/model/stats.spec.ts) — a second read inside the
    window, a cached failure, the window expiring, and a dead host beside a live one, each keyed on
    its own href so the module-scope cache needs no test-only reset export — and in
    `page.server.spec.ts`, which asserts a cached failure still raises the flag while printing
    nothing. Nothing was extracted out of `poll-services-state.ts` — see #18, which is where the
    second caller would make that a real duplication. The five decisions it forced, the regressions
    a periodic `invalidate` introduced and what gates each of them, and the one gap deliberately
    left open, are recorded in AGENTS.md under "Already done".)_

17. _(**Key AdGuard stats by href, and validate the wire shape before transforming** — landed, in
    two halves. The wire-shape check went in first, as a predicate right after `raw.json()`
    in [adguard.ts](src/lib/data/repository/adguard.ts) — a valibot schema since #33 — inside the
    error-as-value boundary, so a
    200 carrying `{"message":"unauthorized"}` becomes an `AppError` instead of rendering
    `DNS queries: undefined` / `Delay: NaNms`. The keying is the rest: a collector beside
    `collectServiceProbes`, `Promise.all` in the load, a keyed record out of it, and a keyed
    lookup in the store. #33 renamed all four and widened the key to provider + href.
    **`findContainer` and `scanContainer` were DELETED**, which is the decision the item asked for:
    the load was their only production caller, and what was left was a `config.spec.ts` describe
    block testing `findContainer` and nothing else — a helper whose one reader is a test of itself
    is what `no-orphans` is for.
    Reproduced before the fix and fenced after it in three places: `config.spec.ts` for the
    collector, `page.server.spec.ts` for two instances asking two hosts and keeping the one that
    answered, and a box-stats-wrapper story mounting two wrappers against one store, because e2e
    cannot render a populated box (the fixture's provider port is closed on purpose).
    **What was deliberately NOT done:** the failure stayed one boolean and credentials stayed one
    global pair, both of which were #33's scope, not this item's — and both landed there.
    Recorded in AGENTS.md under
    "Already done".)_

18. **Re-poll service status on `visibilitychange` and `focus`** — `S`
    `pollServicesState` is one `poll()`, one `setInterval(poll, 15min)` and a teardown that clears
    it and aborts. Add a `visibilitychange` handler calling the existing `poll()` when
    `document.visibilityState === 'visible'`, removed in the teardown the function already returns.
    Zenith listens on **both** `visibilitychange` and `focus` — take the pair, with the guarded,
    torn-down shape from its `session-store.svelte.ts` (its `today` store's listener is
    unconditional; we want the `!document.hidden` guard).
    _Prevents:_ timers do not fire while the OS is suspended and browsers freeze background tabs, and
    `setInterval` does not catch up — a resumed start-page tab asserts, with a green dot, a
    measurement that is hours old, and a recovered service stays red for up to 15 more minutes.
    `#states` is keyed by href (service-store.svelte.ts:19), so the extra poll overwrites rather than
    stacking.
    _This is now the SECOND caller, so it is where the extraction happens._ #16 landed a
    visibility-gated interval in [+page.svelte](src/routes/[...slug]/+page.svelte) — a `setInterval`
    whose body is skipped unless `document.visibilityState === 'visible'`, torn down by its own
    effect. It was deliberately NOT extracted then: one caller is not a duplication. Landing this
    item makes two, which is the point AGENTS.md names for pulling the guarded interval into a
    shared helper — note that #16's is only the gate, and this item still wants the `visibilitychange`
    / `focus` LISTENERS zenith carries on top of it.
    _Files:_ src/lib/business/store/poll-services-state.ts:34-40,
    src/lib/business/store/poll-services-state.spec.ts (fake timers already installed at :39-45; the
    new case needs a `*.svelte.spec.ts` home or a stubbed `document`, since the node project has
    none)

19. _(**Widen `[[slug]]` to `[...slug]` and warn on `pages` keys without a leading slash** —
    landed. The route directory is renamed and `normalizeConfig` **drops** a key with no leading
    slash rather than only warning: the nav links straight to the key, so a relative href that
    navigates somewhere else is worse than no link. `/media/plex` is in
    [fixture-config.json](e2e/fixture-config.json) and asserted at 200 in
    [can-navigate-between-pages.e2e.ts](e2e/can-navigate-between-pages.e2e.ts); `/api/ping` still
    sorts ahead of the rest parameter, verified by the four ping cases in
    [can-see-service-status.e2e.ts](e2e/can-see-service-status.e2e.ts). `/media/*` and `/network/*`
    page grouping is unblocked. Recorded in AGENTS.md under "Config-driven rendering".)_

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
    +layout.svelte:97 scenery; +layout.svelte:191,192 swatches) and SvelteKit's own nonced `<style>`
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
    In +layout.svelte: move `<header>` (:118) out of `<main>` (:112, closing :238) so it maps to
    `banner` instead of `generic` — the IntersectionObserver sentinel at :113 must move with it and
    the header currently inherits `main`'s `p-page-sm md:p-page-md xl:p-page` ramp. Then add
    `@axe-core/playwright` and one `e2e/is-accessible.e2e.ts` scanning `/`, `/services`, `/nope` in
    both locales and with `colorScheme: 'dark'` (the `test.use` pattern exists at
    e2e/can-change-theme.e2e.ts:32-33).
    _All three component-level violations landed in the zenith parity pass_ (verified 2026-08-04),
    once the storybook a11y gate went to `test: 'error'` and every component got a story to run axe
    against: `heading-order` (grid.svelte's subTitle was h5 under an h3 — now h4 at
    grid.svelte:41, under the h3 at :34), `link-name` (box-stats.svelte's anchor was empty
    whenever `stats` was undefined, so its accessible name was `""`; it now carries an
    unconditional `aria-label={m.stats_open({ provider, host })}`, which also replaces the
    four-readings-run-together name in the populated case), and the status dot's `aria-label` on a
    role-less `<span>`, which was ignored outright until the `role="img"` now at
    box-service.svelte:73.
    _The nav and `<title>` halves landed in the design pass_ (verified 2026-08-05): the page links
    sit in a `<nav>` (+layout.svelte:140) with `aria-current="page"` (:144) off `page` from
    `$app/state`, and `<svelte:head>` (:88-91) composes the title from the configured page name
    plus `m.app_title()` (:89). That closes `document-title` **for the app but not for the gate** —
    the title lives in the root layout, which no component story mounts, so axe in storybook still
    cannot see it and only the e2e audit above can.
    **What is left is what no component story can reach:** the `banner` landmark, the title (e2e
    only, above), and the residual dot defect, which is WCAG 1.4.1 colour-only information rather
    than a missing name: it wants a non-colour cue, not another ARIA change.
    _Zenith's nav half is what was ported_ — its `<nav>` wrapper and its
    `aria-current={isActive(link.href) ? 'page' : undefined}`, compared here against
    `page.url.pathname`. Zenith has no `banner` landmark either — its `<nav>` also
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
    _Files:_ src/routes/+layout.svelte:112-118 (the `banner` move; its `<nav>` and `<title>` are
    done), src/lib/presentation/components/box-service.svelte:72-80 (the non-colour cue),
    e2e/is-accessible.e2e.ts (new), e2e/can-navigate-between-pages.e2e.ts.
    grid.svelte, box-stats.svelte and grid.svelte.spec.ts are off this list — their half landed.

## Architecture & extensibility

22. **Close the config→DOM prop spread and make the seam actually fail on a mismatch** — `M`
    AGENTS.md rests the "business owns the config format" decision on `{...container.props}`
    (config-container.svelte:39-47) erroring when a component prop stops matching the schema.
    Measured: it does not. Three parts: (a) drop `& HTMLAnchorAttributes` /
    `& HTMLAttributes<HTMLDivElement>` and remove the `{...restProps}` pass-throughs from the **six**
    components that carry them — box-service.svelte:18,30, box-stats.svelte,
    box-date.svelte:22,37, grid.svelte:17,21, plus dropdown.svelte:15,18 and sub-grid.svelte:6,10;
    `sub-grid` re-uses `grid`'s `Props`, so dropping grid's `& HTMLAttributes` ripples into it.
    **`dropdown`'s pass-through is the one exception — it is LIVE, not dead** (corrected 2026-08-14;
    the earlier note cited +layout.svelte:103/:153, lines that no longer exist): both call sites,
    +layout.svelte:169 and :216, pass `class="flex-1 @2xl/header:flex-none"`, `class` is not
    destructured at dropdown.svelte:15, and it is read at :21 via `restProps.class`. Deleting it drops
    the header menus' flex sizing. Give it a declared `class` prop rather than removing the seam —
    verify the rest with svelte-check at 0; (b) add an allowlist of schema-declared prop
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
    then 500s SSR) and `collectServiceProbes` skips the subtree. Verified: the derived
    `Record<NestingName, true>` errors TS2741 where the array form compiles silently. Not an
    injection vector — Svelte's SSR renderer skips `on*` attributes.
    _Files:_ src/lib/presentation/components/{box-service,box-stats,box-date,grid}.svelte,
    src/lib/business/model/config.ts:81-83,112-129,149-186, src/lib/business/model/config.spec.ts

23. **Give config loading a return channel — LANDED.** `normalizeConfig` returns
    `{ config, warnings }`, `readConfig` returns `{ config, warnings, error, mtimeMs, isFresh }`,
    and `GET /api/health` answers 200 with page count + mtime or 503 with the message. Logging
    moved to the two route callers, gated on `isFresh`, which is what makes it one log per stamp
    instead of the measured 55 lines per 3 requests. `[...slug]/+page.server.ts` now answers 503
    rather than 404 when the config is unreadable and no page matched, so the error stops blaming
    the URL. Two things this item claimed turned out to be already fixed by the time it was worked:
    `src/lib/data/config.ts:29` (the thrown message beating the context) was closed when
    `useAsyncErrorAsValue` was made to compose, and the read-failure branch already cached against
    the stamp — what did not cache was the **stat**-failure branch, and neither retained its
    `AppError`. Both are fixed now. The rest moved into AGENTS.md's errors-as-values section.
    _Unblocked:_ #12's two warnings now have a channel to write into. **`no-console` is enableable**
    — nothing is in the way any more; see the console paragraph in AGENTS.md for the exemption list.

## Features

24. _(**Add a `BoxSearch` container: a config-driven GET search form, no server code** — landed.
    Sixth container: one `v.object` in `containerSchemas` (`href` required, `placeholder`
    optional, `span` like every other container) and one branch before
    `config-container.svelte`'s `never` assert. The box is
    [box-search.svelte](src/lib/presentation/components/box-search.svelte) — a `method="get"` form
    with one `type="search"` input named `q`, `rel="noreferrer"` so the dashboard's internal
    address does not ride along, and a `/`-key handler on `svelte:window` that skips a keystroke
    aimed at a field and `preventDefault`s the one it takes. It is the first container a visitor
    can type into, and AGENTS.md records what that costs.
    **Four of the item's own references were stale or wrong.** `CONTAINER_NAMES` and a
    `requiredProps.BoxSearch` entry do not exist — the file header above says so, and
    `containerSchemas` is the one declaration; the branch chain is :44-60, not :38-52; the props
    list omits `span`, which every container carries and which the editor and `spanStyle()` both
    expect; and "the two new message keys" is **one** — `search_label`, which is both the
    `aria-label` and the placeholder's fallback, so a config that leaves `placeholder` out still
    gets a box that says what it is. No key was needed for a submit button, because there is none:
    one field that blocks implicit submission is all it takes for Enter to submit.
    *Not built:* a prop for the query parameter name. `q` is hardcoded, which is the item's own
    call and holds — Whoogle, SearXNG, Google and DuckDuckGo all read it, so a prop would be a
    second caller that does not exist. The operator-facing consequence — a GET submission
    REPLACES the action's query string, so an href carrying engine options loses them — is in
    README.md, because no code can fix it.)_

25. ~~**Add a `BoxBookmark` container so link-only boxes stop being probed**~~ — **LANDED as a
    `probe` mode instead, which is not what this item asked for.** Kept as a numbered item
    because the Sequencing note below cross-references it. `BoxService` now takes
    `probe: 'tcp' | 'http' | 'none'`, and `none` is the bookmark: no dot, no poll, and — the
    half that matters — absent from `collectServiceProbes`, so it never enters `/api/ping`'s
    allowlist. The architecture is in [AGENTS.md](AGENTS.md) under "Already done", six
    decisions.
    **This item's own reasoning was wrong on the point it turned on.** It said to prefer a new
    container over a flag because "a flag would force `collectServiceHrefs` and the ping
    allowlist to start reading props" — but the allowlist CALLS `collectServiceHrefs`, so there
    was one reader and not two, and it already read `item.props.href`. Weighed against that, a
    second container was a near-duplicate of `box-service.svelte` differing only by the status
    span. Don't re-derive the container.
    **What it got right and what landed with it:** the `tteck` entry was the real complaint, and
    it is `probe: "http"` now rather than a bookmark — a `HEAD` to the page answers the question
    a TCP connect to GitHub Pages never could. Two things this item did not foresee: `probe` is
    the first container prop that is neither a free-form string nor a number, so
    `ContainerField` grew an `enum` kind and `options` for the editor to offer (AGENTS.md
    records why a `v.boolean()` would have cost the same), and the drop warning became `is
missing or not valid` because a rejected enum value can still be a string.
    _Not done, and deliberately:_ the two remaining `probe: 'none'` candidates in `config.json`
    were left alone — that file is the operator's and gitignored, so only the entry under
    discussion was touched.

26. _(**Add `preferredLanguage` to the Paraglide strategy** — landed. The strategy is
    `cookie globalVariable preferredLanguage baseLocale`: an explicit choice still wins, and a
    browser with no cookie yet gets its own language on the first SSR response instead of English.
    It is spelled **twice** — the vite plugin call and the `paraglide` npm script — because the
    CLI has no config file to read one from, which makes it the third sanctioned duplication in
    the repo; AGENTS.md's Commands section and its "One definition per concept" rule both record
    why and that the two must agree. Measured while landing it: with the flag on the plugin only,
    `npm run paraglide` regenerated `runtime.js` with `preferredLanguage` dropped — so `check`,
    `prepare`, CI and a fresh clone would have compiled a different locale resolution than
    `dev`/`build`.
    **Three of the item's own claims were wrong and are not carried forward.** (a) The lever it
    named — `{ locale: 'de' }` on a compiled message, "which
    [can-see-provider-stats.e2e.ts](e2e/can-see-provider-stats.e2e.ts)'s German toast case
    demonstrates" — is neither: that case switches the header dropdown and reloads, and
    `{ locale: 'de' }` cannot reach `box-stats` at all, because the box reads `getLocale()` at
    mount for its `Intl` formatters as well as its messages. What landed instead is a story with
    `overwriteGetLocale` in `beforeEach` and its teardown, asserting the two literals
    (`DNS-Anfragen`, `1.234`) that every other stats story cannot see — the others build their
    expectation from `m.*()` and `getLocale()`, so they stay green with de.json deleted. (b) It
    cited vite.config.ts:11-14; the plugin call was at :13-16. (c) It said
    box-date.svelte.spec.ts:20 matches `/\d{1,2}:\d{2}:\d{2}/` — that spec has no regex at all;
    the locale-blind time pattern is box-date.stories.svelte:50, and it is `\d{2}`.
    *One thing it did not foresee:* Playwright's default Chromium context sends no
    `accept-language` at all, so [playwright.config.ts](playwright.config.ts) pins
    `locale: 'en-US'` for the same reason it pins the fixture config and the fixture's env — the
    suite must not read the language of the machine it runs on.
    *Left open, deliberately:* the SSR response now varies by `Accept-Language` and nothing sets
    `Vary` on it, so a caching reverse proxy in front of `node build` could hand a German page to
    an English visitor. `url` is not in the strategy, so the middleware's only `Vary` branch is
    unreachable. No shareable language link either — that is what `url` would buy, and #13
    records what has to come back with it.)_

## Service integrations

Its own section rather than a fourth entry under Features, because prettier renumbers an ordered
list to run sequentially from its first item: put 33 under Features and `prettier --check` rewrites
it to 27, colliding with Ops. A heading breaks the list, which is what keeps the number stable —
the same applies to a future 34.

33. ~~**Generalize the AdGuard path into a keyed stats provider**~~ — **the CORE AND FOUR
    PROVIDERS LANDED; what is left is the rest of the list.** Kept as a numbered item because
    the notes below cross-reference it, and because the list at the bottom is still work.
    `BoxAdguard` is **gone** and `BoxStats` with a `provider` token replaced it: one container,
    one component, one `Record<ProviderName, ReadProvider>` registry, `{ key, value }[]`
    readings through a presentation-side message map, and per-instance credentials through
    `"secret": "ADGUARD_MAIN"` → `DASHBOARD_SECRET_ADGUARD_MAIN`. **The architecture is in
    [AGENTS.md](AGENTS.md) under "The stats providers", and is deliberately not restated here** —
    the count of decisions, the unit rule, the one-signal handshake, the v6 session cache and the
    redirect split all live there, and a copy in this file is the drift AGENTS.md's own opening
    forbids. What belongs here is only what this item's own instructions got wrong. Three of them
    were NOT followed, each for a reason recorded there:
    - **The registry is in `business/model/stats.ts`, not `data/repository/`.** `Stat`/`StatKey`
      keys a message map, so it is presentation-facing vocabulary and `data → leaf only` forbids
      a repository importing it. `Record<ProviderName, …>` is the same guarantee either way.
    - **`adguardFailed` became `failedStats: { key, provider, href }[]`, not
      `failedProviders: ProviderName[]`.** #17 keyed readings per INSTANCE, so a provider is not
      an identity: with two Pi-holes and one down, "Pi-hole is unavailable" is true, useless and
      indistinguishable from both being down.
    - **`Record<ProviderName, () => string>` is a plain `Record<ProviderName, string>` of
      PRODUCT names** in `presentation/util/provider-name.ts`, not paraglide messages. A product
      name is identical in every locale; the SENTENCE around it is the message, and it takes the
      name as a parameter — the `service_probe_failed({ href })` seam.
      _Self-signed TLS is settled: DOCUMENTED, not worked around._ Node's `fetch` rejects a
      self-signed certificate with no per-request escape hatch, so README tells the operator to
      install a real certificate or terminate TLS at a proxy. `undici` is **not** a dependency, no
      `dispatcher` is passed, and `NODE_TLS_REJECT_UNAUTHORIZED` appears nowhere — it is
      process-global and silently unverifies every other fetch. That decision is what keeps
      **Proxmox VE, TrueNAS, Unifi and Portainer** off the list below rather than on it.
      _Three providers landed on top of the core and the seam held_ — nothing in the route, the
      store, the cache, the schema-generated form or the container branch. `uptime-kuma`,
      `pihole-v5` and `pihole-v6` are in
      [src/lib/data/repository/](src/lib/data/repository/), one file per provider, each with a
      valibot wire schema and a projection in `stats.ts`; what they settled is in AGENTS.md with
      the rest. Two things about them are this item's own, and neither is written down there:
    - **A rejected v5 token is a 200 carrying `[]`, not a 401**, which is #17's wire schema
      paying for itself on the first provider added after it: without it that is an empty box
      and silence.
    - **Their behaviour is transcribed from vendor docs, not measured**, which is this item's own
      instruction and the reason two of the three shipped with defects a review had to find — a
      Pi-hole 6 with no password set could never be read, and a 401 that was not session expiry
      minted a session every 30s until FTL's 16 seats were gone. Both are fixed and fenced in
      `pihole-v6.spec.ts`; treat every endpoint below the same way.

      _What is left is the rest of the list, and the seam is the whole of the work._ Adding one
      is **six** edit points: a repository file, one entry in `providers`, one token in
      `providerNames`, one product name in `providerNameLabel`, and — per reading nothing else
      emits — a `StatKey` with its `stat_*` message in BOTH catalogues plus an entry in
      `box-stats.svelte`'s `chrome` (and `formats`, if the reading is a number). Those last two
      are `Record<StatKey, …>` / `Record<NumericStatKey, …>`, so a missed one is a compile error
      in a file this list used to omit. Ordered by auth cost — cheap first, counters that fit the
      box that already exists:

    - **Sonarr / Radarr / Prowlarr** — `/api/v3/queue`, `X-Api-Key` header, for a queue count.
    - **Immich** (`/api/server/statistics`, `x-api-key`), **Paperless-ngx** (`/api/statistics/`,
      `Authorization: Token`), **Gitea / Forgejo** (`/api/v1/…`, `Authorization: token`).
    - **Jellyfin** — `/Sessions` with `X-Emby-Token`, for the active-stream count.
    - **Glances** — `/api/4/cpu` and `/api/4/mem`, no auth by default: the generic "how is this
      host doing" box, and the one that earns its place on a single-node setup.

    Then the ones needing a handshake or an aggregation: **Portainer**
    (`/api/endpoints/<id>/docker/containers/json`, `X-API-Key`), **qBittorrent**
    (`POST /api/v2/auth/login` for a cookie), **Transmission** (the 409 +
    `X-Transmission-Session-Id` dance), **Nextcloud**
    (`/ocs/v2.php/apps/serverinfo/api/v1/info?format=json`, basic auth plus
    `OCS-APIRequest: true`, XML otherwise), **Plex** (`/status/sessions`, token in the query and
    XML unless `Accept: application/json`), **Home Assistant** (bearer, but one entity per
    number, so its config shape differs from every other provider here).
    _Unverified on purpose:_ every endpoint and header above comes from the vendors' docs, not
    from a live instance behind this code — unlike every other item here, so re-check each
    before implementing it. **That applies to the three that shipped as much as to the ones that
    have not**: their specs mock `fetch`, their repository comments say where the shape was
    transcribed from, and so does README. Homepage's widget list is the working popularity
    ranking if this needs extending.
    _Deliberately NOT built, and each would be a regression:_ a `requiresSecret` capability
    table on the registry (a 401 already says it, and the table is a second declaration of each
    provider's auth that nothing forces to agree with the code); Pi-hole version auto-detection
    (a round trip per cache miss inside the 3s budget, against a host that may be down, for a
    version the operator must know anyway); a client-side fetch or an `/api/stats` endpoint (one
    ships the credential, the other is an SSRF surface — `/api/ping`'s allowlist is the
    precedent); a cap or an aggregate on the failure toasts; a `unit` field on `Stat` (the key
    carries the unit, and a second field is a copy nothing keeps in step).
    _Files:_ src/lib/data/repository/ (one file per provider, new),
    src/lib/business/model/stats.ts, src/lib/business/model/config.ts (`providerNames`),
    src/lib/business/type/stats.ts (a key per new reading),
    src/lib/presentation/util/provider-name.ts, messages/en.json, messages/de.json, README.md

## The admin area and the config editor

The guard, the write path, the editor and #36's login backoff have all landed, and #36's
`.env.example` half closed by hand; all three items are kept as numbered entries because the notes
below still cross-reference them. The
threat model is the reason for the ordering: `config.json` is the internal network map _and_ the
source of `/api/ping`'s allowlist, so a write path without the guard in front of it would let
anyone on the LAN rewrite the allowlist and turn the ping endpoint into an arbitrary internal port
scanner. The guard landed first and #34 landed behind it, which is the whole ordering — but
**`/api/ping` itself is still unauthenticated**, and that is by design only for as long as the
allowlist can be trusted. That trust now rests on the guard rather than on the file being
unwritable — which is what made #36's missing rate limit urgent, and why it landed next. What
stands between a guessed token and a rewritten allowlist is now the token's own length plus a
backoff that caps the guessing at five a minute per address; the remaining exposure is a
distributed guess, which no per-address counter addresses and which a long token makes pointless.

34. ~~**A validate-and-write path for `config.json`**~~ — **LANDED.** Kept as a numbered item so
    #35's "needs #34 under it" still resolves. `$writeConfigFile` → `writeConfig` → the `/admin`
    `save` action, atomic via `.tmp` + `rename`, refusing any config that produces warnings. The
    architecture is in [AGENTS.md](AGENTS.md) under "Config-driven rendering" — four decisions
    about the write plus the diagnostics carve-out. Three things landed that this item did not ask
    for and that are worth knowing: the editor loads `$readConfigText`'s **bytes** rather than the
    normalized config (which has already eaten `defaults`); `not-an-object` is its own rejection
    kind, because `[]` / `null` / `"x"` are valid JSON that `normalizeConfig` accepts in silence and
    a form made that reachable; and `config.spec.ts` now asserts both shipped configs normalize
    warning-free, because refuse-on-warnings means a config already on disk that warns could never
    be saved from the editor. **The successful write is node-spec'd, not e2e'd** — one preview
    server points `DASHBOARD_CONFIG` at the tracked `e2e/fixture-config.json`, so a green write
    test would dirty the tree and poison every later test through the stamp cache; the e2e covers
    the rejection, where nothing is written. Interim UI only: a plain `<textarea>`, which is #35's
    to replace.
35. ~~**A schema-driven form over the containers, not a JSON textarea**~~ — **LANDED.** Generated
    from `containerSchemas` via `containerFields`, arbitrary nesting through a self-referencing
    snippet, and every list has N+1 insertion points so a container can go anywhere in it. The
    architecture is in [AGENTS.md](AGENTS.md) under "Config-driven rendering", including the
    `$state`-proxy trap that makes an added container invisible to both the render and the saved
    file. The raw `<textarea>` did not die — it is now the **repair path**, shown exactly when
    `needsRawEditor` says a save would be refused, because a form can neither save nor fix a file
    whose problem the schema does not describe.
    **What it deliberately does not do**, and what is therefore still open:
    - **Pages cannot be added, removed or renamed**, and a page's `name` is not editable. Only the
      containers inside existing pages are. A new page still means editing the file.
    - **Containers cannot be reordered** — insertion covers "put one here", not "move that one".
      Add/remove at a position plus retyping is the workaround.
    - **Switching a container's type leaves the old type's props in the file**, invisible in the
      form (`items` and all its children survive a Grid → BoxDate switch). Harmless —
      `normalizeConfig` strips them on read — and it is the flip side of preserving keys the
      schema does not name, which is what protects `defaults`. Clearing them on a type change
      would be the fix, and would also throw away a switch made by mistake.
    - **No `use:enhance`**, so saving is a full page POST, and **the payload is built client-side**
      — without JS the form's edits do nothing and a save rewrites the file's own bytes. Lossless
      in content, but it does re-serialize the file's whitespace.
    - **Insertion positions are 1-based indices over the raw array**, so an entry the form cannot
      render shifts the numbers a sighted operator counts. The ordering itself is correct.
    - **Two sibling containers of the same type give their insertion buttons the same accessible
      name** (`Add container to Grid, position 1` twice, on a page with two Grids). Position
      disambiguates within a list, not between lists that share a parent type.
      _Files:_ src/routes/admin/, src/lib/business/model/config.ts,
      src/lib/business/model/config-source.ts
36. ~~**Close the two known gaps in the admin area**~~ — **LANDED.** Kept as a numbered item
    because the notes above and below cross-reference it. **The login backoff:** five failures per
    client address, then `min(5s × 2^(n − 6), 60s)`, refusing even a correct token while the wait
    runs, cleared by a success and pruned on write — which is also the decay, so the sustained
    ceiling is five guesses a minute per address rather than five ever. It went where this item
    said it belonged, in `business/model/admin-auth.ts` and not the hook, and it returns
    `{ status: 'locked'; retryAfterSeconds }` so the login page picks the words. The decisions are
    in [AGENTS.md](AGENTS.md), including why there is deliberately **no e2e** for it and what
    replaces one. **`.env.example` closed by hand, and that is the part worth knowing:** the file
    is on this environment's permission deny list, so no agent that has worked on this repo could
    read or write it — each one handed its text over instead, and the operator pasted it. It now
    names `DASHBOARD_SECRET_<NAME>` and no longer ships the two AdGuard variables #33 retired.
    Nothing here can verify that, and nothing ever will while the deny list stands: it is the one
    tracked file in the repo that no check, lint or test can see.
    _Files:_ .env.example, src/lib/business/model/admin-auth.ts, README.md

## Ops & DX

27. **Ship a production invocation that actually loads `.env`** — `S`
    README's production path is a bare `node build` (README.md:30-31), but adapter-node reads only
    `process.env` (build/env.js; `grep -c dotenv build/index.js` = 0) — so every
    `DASHBOARD_SECRET_<NAME>` and `DASHBOARD_CONFIG` are silently absent in production while
    working in dev. Document `node --env-file=.env build`, an **absolute** `DASHBOARD_CONFIG`
    (src/lib/data/config.ts:16 resolves from the process CWD at module scope, which README.md:31
    notes without connecting it to the variable), and a systemd unit (`EnvironmentFile=`,
    `WorkingDirectory=`) or compose file with the config bind-mounted — neither `deploy/` nor a
    compose file exists yet.
    _The credential half of this item is DONE, and its old text is not:_ it asked for the two
    AdGuard variables to be named in README. They no longer exist — #33 replaced them with the
    per-instance `DASHBOARD_SECRET_<NAME>` scheme, and README now carries a whole "Stats
    providers" section: the naming rule, the provider table, both degradations (a named variable
    left unset is an absence — skipped, warned once in `[...slug]/+page.server.ts`'s `planReads`,
    never toasted; unreachable or refused logs and toasts) and the 3s bound, which is now minted
    in `business/model/stats.ts` rather than per repository. Do not re-add any of that here; what
    is left is the invocation and the deploy files.
    _The `engines` half landed_ (verified 2026-08-04): package.json:6-8 declares `"node": ">=22"`,
    so `.npmrc`'s `engine-strict=true` is no longer inert, and README.md:11-12 documents that an
    older node fails `npm install` outright rather than warning. That also retires this item's
    "(Node ≥20.6)" qualifier on `--env-file` — the flag is guaranteed present at the version the
    package now enforces, so the README does not have to caveat it.
    _Prevents:_ measured before #33 renamed the variables — `node ./build` with a populated `.env`
    logged the skip line and answered in 33ms, while `node --env-file=.env build` resolved the
    credentials and took 2.98s attempting the fetch. The variable names have changed; the
    invocation defect has not. `config.json`
    is now gitignored rather than pointed at with `DASHBOARD_CONFIG`, so the variable matters most
    for a bind-mounted deployment — which is exactly the invocation this item documents.
    _Files:_ README.md:20-32, .env.example (replaced by hand — see #36),
    deploy/revie-dashboard.service or compose.yaml (new). package.json is off this list — its
    `engines` half landed.

28. **Point Playwright's `webServer` at the shipped artifact** — `S`
    _The CI half of this item landed in the zenith parity pass_ —
    [.github/workflows/ci.yml](.github/workflows/ci.yml) now runs `npm run check`, `npm run lint`
    (which chains `lint:deps`), `npm run test:unit -- --run` and `npm run test:e2e`, with
    `npx playwright install --with-deps chromium` and an `actions/cache@v4` on
    `~/.cache/ms-playwright` keyed by the resolved Playwright version, plus
    `permissions: contents: read` and a concurrency block with `cancel-in-progress` on non-main.
    zenith's `depcheck` step and chromatic job were dropped as planned.
    **What is left:** change playwright.config.ts:15 from `npm run build && npm run preview`
    (i.e. `vite preview`) to `node build` with an explicit `PORT=4173` and the existing
    `DASHBOARD_CONFIG: 'e2e/fixture-config.json'`.
    _Payoff:_ everything under build/ — the artifact that ships — is exercised by nothing: the
    Playwright command builds it and throws it away, then tests `vite preview` instead. That
    runtime split (own CWD/env resolution at src/lib/data/config.ts:16, ORIGIN-derived CSRF check
    that the `POST /api/ping` tests at e2e/can-see-service-status.e2e.ts:23-49 depend on,
    sirv/compression instead of Vite) is structurally why the `.env` divergence in #27 went
    unnoticed; assert the ping POST still behaves under it. It also means CI's only build is the
    one the e2e webServer performs, so a broken `node build` is still nobody's failure.
    Optional: fail on a `npm run depgraph` diff (needs graphviz `dot`) — the committed
    dependency-graph.svg is **not** currently stale (68e35c9 is the last commit touching both it
    and src/). Deliberately not done: graphviz output is not stable across `dot` versions, so a
    runner upgrade would fail unrelated PRs.
    _Files:_ playwright.config.ts:14-23

29. **Add two drift-fence node specs: the four hand-mirrored invariants, and doc links** — `M`
    One spec reading the real files with `node:fs` (the `server` project at vite.config.ts:35-43 is
    the home; no spec anywhere reads a real file today — config-source.spec.ts _mocks_
    `node:fs/promises`). Assert: (1) `messages/en.json` and `messages/de.json` have identical key sets
    (22 each incl. `$schema`); (2) the `--spacing-*` names in tokens.css:46-86 (28) equal the spacing
    array in style.ts:12-41 (28) — exporting that array out of the inline `extendTailwindMerge` call
    is part of the work; (3) every `css` class of every one of the 27 `themes` entries has a palette
    selector in themes.css (25) or base.css (`.solid-light`:19, `.dark`:183), and an
    `@custom-variant` in tokens.css **except** `solid-light`. There is no assertion (4): app.html's
    hardcoded class is already gone, replaced by the `%theme.default%` placeholders `handleTheme`
    fills from the catalogue, so no hand-mirrored token is left there to fence. Second spec: extract
    every
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

30. _(**Cover `business/model/appearance.ts`, and build the repo's first rune harness for
    `ThemeStore`** — landed, with one of its four store cases never written and one overtaken.
    [appearance.spec.ts](src/lib/business/model/appearance.spec.ts) has the spied-`set` jar the
    item specified and covers both `readOrMintScenerySeed` paths — a stored seed writes nothing,
    an absent one mints once and the next read returns the same number.
    [theme-store-harness.svelte](src/lib/test/theme-store-harness.svelte) is the repo's first rune
    harness, driven from
    [theme-store.svelte.spec.ts](src/lib/business/store/theme-store.svelte.spec.ts) (6 cases), and
    AGENTS.md's "Already done" records why it lives under `src/lib/test/` rather than under
    `presentation/`. Of the four `ThemeStore` cases the item listed: the deleted-theme fall-through
    and the `prefers-reduced-motion` seeding are covered in both directions — seeding when the
    payload records no choice, and NOT seeding over a payload that says motion is on — "cookie
    beats the SSR seed" was **overtaken by #9**, which deleted the path, and the spec asserts the
    payload seeding in its place; **"each setter mirrors to the cookie" was never written**, so
    nothing calls `switchTheme`, `rerollScenery` or `toggleSceneryMotion`. That is the gap to close
    next, and it is the half that would catch a write regression.
    Two things the item asked for that are not covered and were not the store's: the
    deleted-theme guard in `readRequestAppearance` (`appearance.ts` — non-empty `themeClass`,
    `theme: undefined`) has no spec, and the harness has not been reused for any of the other
    rune-constructor modules it named.
    *Files:* src/lib/business/model/appearance.spec.ts,
    src/lib/test/theme-store-harness.svelte,
    src/lib/business/store/theme-store.svelte.spec.ts)_

## Upstream drift (the `zenith` ports)

Everything else portable from zenith maps onto an item above — see #10, #18, #21, #28. The
app.html and reduced-motion ports (#3, #4) have landed, so has the scenery-seed one (#11), and so
have both items this section held.

_(#31 — "retire the self-referential `--color-x: var(--color-x)` idiom" — landed. All 15 `@theme`
entries now alias the unprefixed upstream seed (`--color-danger: var(--danger)`), base.css declares
those seeds, and no `--color-*` declaration is left in base.css or themes.css. Only `--blur`
(tokens.css:95) and `--radius` (:102) still self-reference, which is the documented carve-out in
AGENTS.md's Invariants. The five non-`@theme` accents the item wanted next are in too:
`--mind`/`--mind-strong`/`--body`/`--flow`/`--mixed` are declared under the upstream names in
base.css:110-114 and :203-207, deliberately unmapped to utilities.)_

_(#32 — "port zenith's `.storybook/preview.ts`" — landed in the zenith parity pass. The file is the
theme toolbar over the catalogue plus `mountScenery()` at a fixed `SCENERY_SEED = 42`, on the
singular `presentation/util/` paths, with the controls matchers. Both of the item's caveats were
overtaken: the storybook vitest project exists, so `a11y: { test: 'error' }` is consumed rather than
dishonest, and it is set to `'error'` — see AGENTS.md's Conventions, which now treats that gate as
the repo's only automated a11y check.)_

## Sequencing

The order that matters, beyond the group ranking:

- ~~**#23 before #12**~~ — landed. #12's two warnings now have the channel to write into, and
  `no-console` is enableable whenever someone wants it.
- ~~**#34 before #35**~~ — landed. #35 now has the action, the `ConfigWrite` kinds and the
  rendered diagnostics under it, and a `<textarea>` to replace.
- ~~**#36 is now the admin area's weakest point, not a nicety**~~ — the rate-limit half landed for
  exactly this reason. Before #34 a guessed token bought read access to the config; it now buys a
  write to the file `/api/ping` derives its allowlist from, which is what made an unlimited-guess
  login form the wrong thing to leave open. The token's length is no longer the only control.
- ~~**#25 is now overdue, not optional**~~ — landed, as a `probe` mode rather than the
  `BoxBookmark` container the item asked for. The `tteck` entry is `probe: "http"`, so the four
  connects an hour now ask the question they were pretending to answer; `probe: "none"` is the
  bookmark, and it is the value that keeps an entry out of the allowlist. The item records why
  its own argument against a flag did not survive checking.
- ~~**#17 before #16**~~ — landed. The load returns a keyed record of readings and
  page.svelte's prop moved with it, so #16's refresh has the keyed shape under it already.
- ~~**#16 before #33**~~ — both landed. The TTL cache and the refresh interval went in first, so
  #33 inherited only the vendor in the names and the one global credential pair, which was its
  own work; it was the generalization #16 and #17 set up, not a parallel track.
- ~~**#26 before #13**~~ — both landed, and #26 is what settled #13's choice. The item offered a
  deletion or a load-side fix; a strategy of `cookie globalVariable preferredLanguage baseLocale`
  localizes no path, so `reroute` had nothing left to de-localize and the deletion was the whole
  of it. Reopening #13 is what adding `"url"` costs, and #26's own entry says why nobody has.
- ~~**#30 before #9**~~ — both landed, in that order. The harness and its spec went in first,
  so the `ThemeStore` deletion was made against six passing cases rather than against
  nothing — and one of them, "cookie beats the SSR seed", had to be rewritten as the
  payload-seeding case because #9 removed the path it was asserting. #30's remaining gap
  (no setter writes a cookie in any test) is recorded on the item.
- **#21 still needs its own axe pass**, even though the storybook gate now runs. `addon-a11y` globs
  every story (.storybook/main.ts:4) at `test: 'error'`, but landmarks, heading order across the
  config recursion, `document-title` and the 27 theme palettes only exist on the composed,
  server-rendered page — which only the axe e2e audit sees.
