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

**Numbers are stable, so gaps mean landed.** 21 items are open — 20 from the review passes, plus
item 36, which came from building the admin guard rather than from a review and is now down to a
single line in `.env.example`, a file this environment will not let an agent write; **1, 2, 3, 4, 5,
6, 7, 8, 11, 19, 23, 31, 32, 34 and 35 are done** — the decisions worth not reverting moved into AGENTS.md's "Already done" and Invariants, and
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

_(#7 — "Storybook is installed with zero stories" — landed in the zenith parity pass. All ten
components now have a `*.stories.svelte` beside them whose play functions run as tests in a third
vitest project. See AGENTS.md's "Already done".)_

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
   `adguardFailed: boolean`, and `[...slug]/+page.svelte` picks the paraglide message. Ported from
   zenith, which has no language problem for exactly this reason — its seams are `() => void` and
   its variants are kinds. Five shape decisions plus the `untrack` trap are in AGENTS.md's
   "Already done"; the no-copy-crosses-a-layer rule is under "Errors are values". What this did
   NOT do: the credentials-absent branch still only warns, an unconfigured box being an absence
   rather than a failure, and the three `console` calls on this path are now permanent by
   design — #23 covers the seven that are not.)_
9. **Delete the browser cookie re-read in `ThemeStore`** (lines 99–109 + the `browser` import at
   :2). The same cookie was already resolved through the same `resolveThemeName` to produce
   `data.theme` in the same request, so it can only ever equal what was handed in — while its early
   `return` makes the blocks below look conditional when they aren't. Unverifiable until #30's rune
   harness exists.
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
    _Narrowed by #23 and the valibot migration:_ the first half is mostly closed — validation is
    `safeParse` throughout, so `normalizeConfig` no longer throws on malformed input and now hands
    its diagnostics back as values. What survives is the **recursion**, which no schema can catch
    because `defaults` is merged before the parse: a `defaults` entry for `Grid`/`SubGrid` carrying
    `items` still recurses until the stack goes. Deleting structural keys from `defaultProps` is the
    fix, and it is the whole of what is left here.
    _Prevents:_ reproduced on the built server — `GET /` returns 500 twice in a row with SvelteKit's
    bare `Internal Error` shell (not `+error.svelte`), forever, because line 43 never completes so
    `cache` stays `undefined`; `+layout.server.ts:6` awaits the same function, so the header nav
    dies too. README.md:63 promises "a malformed container is dropped with a warning instead of
    breaking the page".
    _Files:_ src/lib/business/model/config-source.ts:43, src/lib/business/model/config.ts:147-173,
    src/routes/[...slug]/page.server.spec.ts

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
    `+page.server.ts:59` awaits `loadAdguardStats(page)` inline and nothing caches the result.
    Mirror config-source.ts:18's cache shape with a short TTL so at most one request per window pays
    the 3s bound (keep the bound), then add `depends('dashboard:adguard')` in the load and a
    visibility-gated `invalidate('dashboard:adguard')` interval in **src/routes/[...slug]/+page.svelte**
    (reuse the setInterval + teardown shape at poll-services-state.ts:19-23). Note `invalidate`
    re-runs the whole load, so `readConfig` (mtime-cached) runs again too.
    _Prevents:_ measured with a blackhole href — `ttfb=2.996s` then `2.954s` on the second request,
    while a 404 on the same server answers in 0.005s; repository/adguard.ts:16-22's own comment says
    "it does not get to hold the other boxes hostage". Also unfreezes the only real-data widget,
    currently loaded once per navigation while the date box ticks at 1s and dots re-poll at 15min.
    _Files:_ src/routes/[...slug]/+page.server.ts:51-67, src/lib/business/model/adguard.ts,
    src/routes/[...slug]/+page.svelte

17. **Key AdGuard stats by href, and validate the wire shape before transforming** — `M`
    `loadAdguardStats` resolves `findContainer(page, 'BoxAdguard')` — first match at any depth — and
    `AdguardStore` holds one value that box-adguard-wrapper.svelte:11 hands to every instance without
    reading `props.href`. Add `collectAdguardHrefs` beside `collectServiceHrefs` (config.ts:272-286),
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
    _Sequencing:_ the load's return type changes to a record, rippling into page.svelte:10-21 — land
    this before #16's refresh. Decide explicitly whether `findContainer` (config.ts:258-269) gets
    deleted; `+page.server.ts:17` is its only production caller. Cheap fallback if multi-instance is
    not wanted: warn on a second BoxAdguard via #23's channel (credentials are global —
    `+page.server.ts:23` reads one `ADGUARD_USERNAME`/`ADGUARD_PASSWORD` pair — so keying only
    supports instances sharing a login).
    _Files:_ src/routes/[...slug]/+page.server.ts:17, src/lib/business/model/config.ts:272-286,
    src/lib/business/store/adguard-store.svelte.ts:12-20,
    src/lib/presentation/components/box-adguard-wrapper.svelte:11,
    src/lib/data/repository/adguard.ts:43-47, src/lib/presentation/components/page.svelte:28

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
    grid.svelte:41, under the h3 at :34), `link-name` (box-adguard.svelte's anchor was empty
    whenever `stats` was undefined, so its accessible name was `""`; it now carries an
    unconditional `aria-label={m.adguard_open()}` at box-adguard.svelte:79, which also replaces the
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
    grid.svelte, box-adguard.svelte and grid.svelte.spec.ts are off this list — their half landed.

## Architecture & extensibility

22. **Close the config→DOM prop spread and make the seam actually fail on a mismatch** — `M`
    AGENTS.md rests the "business owns the config format" decision on `{...container.props}`
    (config-container.svelte:39-47) erroring when a component prop stops matching the schema.
    Measured: it does not. Three parts: (a) drop `& HTMLAnchorAttributes` /
    `& HTMLAttributes<HTMLDivElement>` and remove the `{...restProps}` pass-throughs from the **six**
    components that carry them — box-service.svelte:18,30, box-adguard.svelte:16,42,
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
    then 500s SSR) and `collectServiceHrefs` skips the subtree. Verified: the derived
    `Record<NestingName, true>` errors TS2741 where the array form compiles silently. Not an
    injection vector — Svelte's SSR renderer skips `on*` attributes.
    _Files:_ src/lib/presentation/components/{box-service,box-adguard,box-date,grid}.svelte,
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

24. **Add a `BoxSearch` container: a config-driven GET search form, no server code** — `M`
    Add `'BoxSearch'` to `CONTAINER_NAMES` (config.ts:15), a `requiredProps.BoxSearch` entry
    (config.ts:112-127 is a `Record<ContainerName, …>`, so this is compile-mandatory), and one branch
    in config-container.svelte's if/else chain (:38-52, ending in the `never` assert). Props: `href`
    (required), optional `placeholder`; renders `<form action={href} method="get"><input name="q">`
    — hardcode `q` (Whoogle, SearXNG, Google, DuckDuckGo all use it). Add a `/`-key focus handler and
    the two new message keys to **both** messages/en.json and messages/de.json (the keys-in-sync
    invariant).
    _Payoff:_ the dashboard itself takes no input — every `<form>` and `<input>` in the tree now
    belongs to `/admin`, so on the pages a visitor actually loads the first thing they do after
    their start page renders is leave for the address bar. The target is already self-hosted: config.json:227-228 links Whoogle at
    `http://192.168.178.192:5000/` as a click-through.
    _Files:_ src/lib/business/model/config.ts:15,112-127,
    src/lib/presentation/components/config-container.svelte:38-52,
    src/lib/presentation/components/box-search.svelte (new), messages/en.json, messages/de.json,
    README.md:63-66

25. **Add a `BoxBookmark` container so link-only boxes stop being probed** — `S`
    Same three edit points as #24 (`CONTAINER_NAMES`, `requiredProps`, one config-container branch):
    `title` required, `img.src`/`subtitle` optional, no status dot, no store. Because
    `collectServiceHrefs` (config.ts:272) walks only `isBoxService`, a bookmark is automatically
    excluded from the poll set and from `/api/ping`'s allowlist (api/ping/+server.ts:45) — zero
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
    (the same per-request reason box-date.svelte's formatter sits there): box-adguard.svelte:24,26
    pass raw numbers and the compiled
    message is `` `DNS-Anfragen: ${i?.count}` ``.
    _Payoff:_ closes the first-render locale gap in a deliberately bilingual app, and `43871` becomes
    `43.871` in German. Nothing tests the READINGS in German: box-date.svelte.spec.ts:20 matches
    `/\d{1,2}:\d{2}:\d{2}/` (true in every locale), box-adguard.svelte.spec.ts:31-45 compares
    against `m.*()` so it auto-follows any format change, and e2e cannot render a populated AdGuard
    box (fixture-config.json:12 points at closed port 9999). Assert it in
    box-adguard.svelte.spec.ts against a literal string — the compiled message accepts
    `{ locale: 'de' }`, which is the lever
    [can-see-adguard-stats.e2e.ts](e2e/can-see-adguard-stats.e2e.ts)'s German toast case
    demonstrates for the one path that IS asserted in German since #8 landed.
    _Files:_ vite.config.ts:11-14, src/lib/presentation/components/box-adguard.svelte:24-34,
    src/lib/presentation/components/box-adguard.svelte.spec.ts

## Service integrations

Its own section rather than a fourth entry under Features, because prettier renumbers an ordered
list to run sequentially from its first item: put 33 under Features and `prettier --check` rewrites
it to 27, colliding with Ops. A heading breaks the list, which is what keeps the number stable —
the same applies to a future 34.

33. **Generalize the AdGuard path into a keyed stats provider, then add Pi-hole, Proxmox and the
    rest** — `L`
    Stats are hardcoded to one vendor at every layer: the literal `'BoxAdguard'` in
    `CONTAINER_NAMES` (config.ts:15), one `findContainer(page, 'BoxAdguard')` in the load
    (+page.server.ts:17), one global credential pair (+page.server.ts:23), and one `AdguardStats`
    in the store (adguard-store.svelte.ts:12). A second integration is therefore not an addition,
    it is a fourth copy of the three defects #16 and #17 already name. **Land those two first** —
    they are what turns "AdGuard, singular" into "a provider, keyed by href, `Promise.all`'d inside
    one 3s bound, TTL-cached".
    _One container, not one per service._ Add `'BoxStats'` with a `provider` token
    (`"provider": "pihole"`) rather than a dozen container names. A dozen names means a dozen
    `requiredProps` entries (config.ts:114-131), a dozen branches before config-container.svelte's
    `never` assert (:38-52), and a dozen components; a token keeps presentation at one component
    and moves compile-time completeness to a `Record<ProviderName, Provider>` in
    `data/repository/` — same guarantee, in the layer that owns the wire shapes. Decide one
    wrinkle up front: `AdguardStats` is four named fields (business/type/adguard-stats.ts) rendered
    through four paraglide messages, and business cannot pick a message per provider — it names no
    component, and paraglide is presentation's. So business returns `{ key, value }[]` and
    presentation holds a `Record<StatKey, (value) => string>` message map, complete the same way
    `requiredProps` is.
    _Credentials need a scheme, and that is the real work._ One pair cannot serve two Pi-holes.
    Have the config entry name its variable instead of carrying the secret
    (`"secret": "PIHOLE_MAIN"` → `DASHBOARD_SECRET_PIHOLE_MAIN` through `$env/dynamic/private`):
    `config.example.json` is tracked, so a secret in the file format is a secret in someone's
    repo. Keep the fetch server-only — the load hands the page derived numbers and nothing else,
    and a provider written as a client store would ship the key — and keep the href config-only,
    never a query param, which is the difference between a dashboard and an SSRF proxy
    (`/api/ping`'s allowlist at api/ping/+server.ts:45 is the precedent).
    _Self-signed TLS is what actually blocks Proxmox._ Proxmox on :8006, TrueNAS, Unifi and
    Portainer all ship self-signed certs and Node's `fetch` rejects them with no per-request
    escape hatch. Verified: both `fetch(` sites in src (service.ts:13, adguard.ts:33) pass no
    dispatcher, and `undici` / `rejectUnauthorized` / `NODE_TLS_REJECT_UNAUTHORIZED` appear nowhere
    in src or package.json. Either an `undici` `Agent` with `connect: { rejectUnauthorized: false }`
    passed as a per-request `dispatcher` — which adds `undici` as a direct dependency, since Node
    ships it internally but exports no module — or document that the operator installs a real cert.
    Not `NODE_TLS_REJECT_UNAUTHORIZED=0`: it is process-global and silently unverifies every other
    fetch. Either way it is a per-provider opt-in, so settle it before Proxmox rather than during.
    _Order the providers by auth cost, not popularity._ Cheap first — one GET, one header, counters
    that fit the box that already exists:
    - **Uptime Kuma** — `/api/status-page/<slug>` plus `/api/status-page/heartbeat/<slug>`, no auth
      on a public status page. Write this one first: it exercises the whole keyed refactor with no
      credential scheme at all.
    - **Pi-hole** — the direct AdGuard sibling, and most people run one or the other. Mind the v6
      break: v5 is a single `GET /admin/api.php?summaryRaw&auth=<hash>`, v6 needs a session
      (`POST /api/auth` → `X-FTL-SID`, then `/api/stats/summary`). Both are deployed in the wild.
    - **Sonarr / Radarr / Prowlarr** — `/api/v3/queue`, `X-Api-Key` header, for a queue count.
    - **Immich** (`/api/server/statistics`, `x-api-key`), **Paperless-ngx** (`/api/statistics/`,
      `Authorization: Token`), **Gitea / Forgejo** (`/api/v1/…`, `Authorization: token`).
    - **Jellyfin** — `/Sessions` with `X-Emby-Token`, for the active-stream count.
    - **Glances** — `/api/4/cpu` and `/api/4/mem`, no auth by default: the generic "how is this
      host doing" box, and the one that earns its place on a single-node setup.

    Then the ones needing a handshake, an aggregation or the TLS decision: **Proxmox VE**
    (`/api2/json/cluster/resources` with `Authorization: PVEAPIToken=…` — a token, no login
    round-trip, but self-signed TLS and a flat resource list to aggregate), **Portainer**
    (`/api/endpoints/<id>/docker/containers/json`, `X-API-Key`), **qBittorrent**
    (`POST /api/v2/auth/login` for a cookie), **Transmission** (the 409 +
    `X-Transmission-Session-Id` dance), **Unifi** (cookie login and self-signed),
    **Nextcloud** (`/ocs/v2.php/apps/serverinfo/api/v1/info?format=json`, basic auth plus
    `OCS-APIRequest: true`, XML otherwise), **Plex** (`/status/sessions`, token in the query and
    XML unless `Accept: application/json`), **TrueNAS**, **Home Assistant** (bearer, but one entity
    per number, so its config shape differs from every other provider here).
    _Payoff:_ the demand is already in the config as dead click-throughs — README.md:50-53 links
    Proxmox at `https://192.168.178.180:8006` as a plain `BoxService` whose only feedback is a
    status dot, the same shape as the Whoogle entry #24 cites. Stats are the one thing a start page
    shows that a browser bookmark cannot.
    _Unverified on purpose:_ every endpoint and header above comes from the vendors' docs, not from
    a live instance behind this code — unlike every other item here, so re-check each before
    implementing it. Homepage's widget list is the working popularity ranking if this needs
    extending.
    _The failure channel is in — #8 landed._ An unreachable AdGuard box returns a flag and the
    route toasts a paraglide message. What a provider ADDS is that the toast has to name WHICH one
    failed — one line is enough for one widget and useless for eight — and the way it does that is
    **not** by returning a sentence: no copy crosses a layer (AGENTS.md, "Errors are values"). So
    `adguardFailed: boolean` becomes `failedProviders: ProviderName[]`, and presentation holds a
    `Record<ProviderName, () => string>` message map, complete the same way `requiredProps` is —
    the same shape this item already proposes for `StatKey`, for the same reason. A provider name
    is data; the sentence around it is presentation's.
    _Files:_ src/lib/business/model/config.ts:15,114-131, src/lib/business/model/stats.ts (new),
    src/lib/data/repository/ (one file per provider),
    src/lib/business/store/adguard-store.svelte.ts,
    src/lib/presentation/components/box-stats.svelte (new),
    src/lib/presentation/components/config-container.svelte:38-52,
    src/routes/[...slug]/+page.server.ts:16-48, messages/en.json, messages/de.json,
    README.md:65-74, .env.example

## The admin area and the config editor

The guard, the write path, the editor and #36's login backoff have all landed; what is left of #36
is one line in `.env.example`, and all three items are kept as numbered entries because the notes
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
36. **Close the two known gaps in the admin area** — **the rate limit LANDED; the
    `.env.example` line is the operator's own paste**
    Kept as a numbered item because the notes above and below cross-reference it. **The login
    backoff is in:** five failures per client address, then `min(5s × 2^(n − 6), 60s)`, refusing
    even a correct token while the wait runs, cleared by a success and pruned on write — which is
    also the decay, so the sustained ceiling is five guesses a minute per address rather than five
    ever. It went where this item said it belonged, in `business/model/admin-auth.ts` and not the
    hook, and it returns `{ status: 'locked'; retryAfterSeconds }` so the login page picks the
    words. The decisions are in AGENTS.md, including why there is deliberately **no e2e** for it
    and what replaces one. **The `.env.example` line is still open and cannot be closed from
    here:** the file is on this environment's permission deny list, so the agents doing this work
    were never able to touch it — the text to paste was handed over in the conversation instead.
    _Files:_ .env.example (open), src/lib/business/model/admin-auth.ts, README.md

## Ops & DX

27. **Ship a production invocation that actually loads `.env`, and document the AdGuard contract** —
    `S`
    README's production path is a bare `node build` (README.md:24-25), but adapter-node reads only
    `process.env` (build/env.js; `grep -c dotenv build/index.js` = 0) — so `ADGUARD_USERNAME`,
    `ADGUARD_PASSWORD` and `DASHBOARD_CONFIG` are all silently absent in production while working in
    dev. Document `node --env-file=.env build`, an **absolute** `DASHBOARD_CONFIG`
    (src/lib/data/config.ts:16 resolves from the process CWD at module scope, which README.md:25
    notes without connecting it to the variable), and a systemd unit (`EnvironmentFile=`,
    `WorkingDirectory=`) or compose file with the config bind-mounted — neither `deploy/` nor a
    compose file exists yet. In the same README pass, name the two AdGuard variables (they appear
    **nowhere** in README.md or AGENTS.md — README.md:17 says only "AdGuard credentials, optional",
    and the names live in `.env.example` and `+page.server.ts:23`), state that they are runtime
    `$env/dynamic/private`, and describe the two degradations, which are no longer the same one
    now that #8 has landed: credentials absent is a silent empty box plus a `console.warn`
    (+page.server.ts:23-28 — deliberately not toasted, an unconfigured box being an absence rather
    than a failure, so this is the case the README has to explain instead), while
    unreachable/401 both logs and toasts the reason (:30-48). Mention the 3s `AbortSignal.timeout`
    (repository/adguard.ts:38) as what the reader will see in that toast on a dead host.
    _The `engines` half landed_ (verified 2026-08-04): package.json:6-8 declares `"node": ">=22"`,
    so `.npmrc`'s `engine-strict=true` is no longer inert, and README.md:11-12 documents that an
    older node fails `npm install` outright rather than warning. That also retires this item's
    "(Node ≥20.6)" qualifier on `--env-file` — the flag is guaranteed present at the version the
    package now enforces, so the README does not have to caveat it.
    _Prevents:_ measured — `node ./build` with a populated `.env` logs
    `ADGUARD_USERNAME / ADGUARD_PASSWORD are not set, skipping AdGuard stats` and answers in 33ms;
    `node --env-file=.env build` resolves them and takes 2.98s attempting the fetch. `config.json`
    is now gitignored rather than pointed at with `DASHBOARD_CONFIG`, so the variable matters most
    for a bind-mounted deployment — which is exactly the invocation this item documents.
    _Files:_ README.md:21-26,65-74, .env.example,
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
- **#25 is now overdue, not optional** — #2 has landed, so `/api/ping` opens a real TCP connection
  to whatever a `BoxService` names. `config.json:32-42`'s `tteck` entry points at
  community-scripts.github.io, which means four connects an hour to GitHub Pages to paint a
  meaningless dot (`POLL_INTERVAL_MS` 15min). Move that entry to a bookmark.
- **#17 before #16** — #17 changes the load's return type to a record, rippling into
  page.svelte:10-21 and, since #8 landed, into `[...slug]/+page.svelte`, which now spreads the
  load's `adguard` / `adguardError` into the component by hand.
- **#16 and #17 before #33** — a second stats provider inherits AdGuard's single-value store, its
  uncached serial await and its one global credential pair unless those two land first. #33 is the
  generalization they set up, not a parallel track.
- **#30 before #9** — the `ThemeStore` edit is unverifiable without a rune harness.
- **#21 still needs its own axe pass**, even though the storybook gate now runs. `addon-a11y` globs
  every story (.storybook/main.ts:4) at `test: 'error'`, but landmarks, heading order across the
  config recursion, `document-title` and the 27 theme palettes only exist on the composed,
  server-rendered page — which only the axe e2e audit sees.
