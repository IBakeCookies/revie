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

**Numbers are stable, so gaps mean landed.** 5 items are open — #10 from the review passes, the
rest of #33's provider list above, 38 under New work, and 49–51 under New containers minus the
landed #50; **1, 2, 3, 4, 5,
6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
34,
35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47 and 48 are done** — the decisions worth not reverting moved into AGENTS.md's "Already done" and Invariants,
and the rest of the numbering stays put so the cross-references below keep resolving. A landed item
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
    **Folded in:** also delete the dead `npm run preview` script from package.json — #28 moved
    the e2e webServer to `node build` and recorded "`npm run preview` now has no caller in the
    repo" as what it left behind.
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
12. _(**Two missing config warnings** — landed, and the item was half stale by the time it ran. The
    `defaults` half is what this pass added: `withoutStructuralDefaults` now warns on a key naming
    no container (`Ignoring the defaults for "BoxServices", no such container exists`) and on an
    entry that is not a set of props, both minted in the model and returned in `warnings` like
    every other one — neither prints — and both **once per `defaults` entry at the root**, not once
    per container that inherits it. The merge is why they were silent: it only ever looks
    `defaults[raw.name]` up for a name the schema already knows, so a typo'd key is never looked up
    and the operator's defaults simply never apply. Fenced by one case in
    [config.spec.ts](src/lib/business/model/config.spec.ts) asserting both sentences, beside the two
    that keep both shipped configs normalizing warning-free — which is what keeps them saveable
    from `/admin` under refuse-on-warnings.
    **The `span` half was already in the tree before this pass**: `normalizeConfig` warns
    `Ignoring "span" on container "…", it has to be a whole number`, next to the `class` /
    `gridClass` strip. Nothing was changed for it, and this item is where that doc drift went
    unnoticed. Recorded in AGENTS.md under "Config-driven rendering".)_
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

15. _(**State `secure` explicitly on all three appearance cookies** — landed, both directions.
    `COOKIE_WRITE_OPTIONS` is now `cookieWriteOptions(secure)`; `writeCookie` derives the flag from
    `location.protocol` **inside the function**, never at module scope, because `cookie.ts` sits on
    the SSR import path and there is no `location` there; `$createScenerySeedCookie` takes `secure`
    as a parameter; and `readOrMintScenerySeed(cookies, url)` makes the decision off the request URL
    `+layout.server.ts` hands it (R1). `admin-session-repository.ts` keeps its own `secure: !dev`,
    and only its comment changed, to name the new identifier. The item's line citations are dropped
    with the constant they pointed at.
    **Two things it did not foresee, both measured.** adapter-node's `get_origin` defaults the
    protocol to `https` when `PROTOCOL_HEADER` is unset and never consults the socket, so
    `event.url.protocol` reads `https:` on a plain-http server — the server half is only honest once
    `ORIGIN` is set, a requirement that PREDATES this item, because `POST /admin/login` over plain
    http without `ORIGIN` already answered 403. And the browser drop is **not universal**:
    `http://localhost` and `http://127.0.0.1` are potentially-trustworthy origins and accept a
    `Secure` cookie, so the failure belongs to LAN-address deployments alone
    (`http://192.168.x.x:3000`) — the sharper version of this item's own "invisible in dev and CI".
    AGENTS.md's appearance pipeline carries the measurements, the two-sources carve-out for
    `secure`, and why no code change compensates for an unset `ORIGIN`; README.md carries the
    operator half, beside the admin TLS note.)_

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
    nothing. Nothing was extracted out of `poll-services-state.ts`, and #18 landing is what settled
    that rather than making it a duplication — the reason is on that item. The five decisions it
    forced, the regressions
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

18. _(**Re-poll service status on `visibilitychange` and `focus`** — landed, with two guards the
    item did not ask for and without the extraction it promised. Zenith's pair of listeners is
    there, both removed in the teardown that already cleared the interval and aborted the signal.
    What the review pass added on top: the `!document.hidden` guard moved INTO `poll()`, so the
    15-minute interval and the eager first poll are gated by it too — a page loaded into a
    background tab therefore skips its first poll, and the `visibilitychange` listener is what
    covers it on the way back — and the wake path carries an ELAPSED guard, so a wake polls only
    once `POLL_INTERVAL_MS` has passed since the last poll. Unguarded, the re-poll rate was
    however often somebody changes windows, and a probe-failure toast the user had dismissed came
    straight back, `ToastStore` deduping only against what is currently on screen.
    **The extraction this item promised was deliberately REFUSED**, and being the second caller is
    not what settled it: #16's gate exists to SUPPRESS a tick nobody is reading, while these
    listeners exist to CREATE the tick the interval never delivered, so one helper serving both
    would carry a flag telling the two apart.
    Its spec moved to
    [poll-services-state.svelte.spec.ts](src/lib/business/store/poll-services-state.svelte.spec.ts)
    — so the item's old citation is dropped — 13 cases in real chromium, which is this item's own
    "needs a `*.svelte.spec.ts` home" alternative taken: the module now touches `document` and
    `window`, and the node project has neither. Every production half is mutation-audited to have
    at least one failing case. Recorded in AGENTS.md under "Already done", and the suffix
    convention it establishes is under "Conventions".)_

19. _(**Widen `[[slug]]` to `[...slug]` and warn on `pages` keys without a leading slash** —
    landed. The route directory is renamed and `normalizeConfig` **drops** a key with no leading
    slash rather than only warning: the nav links straight to the key, so a relative href that
    navigates somewhere else is worse than no link. `/media/plex` is in
    [fixture-config.json](e2e/fixture-config.json) and asserted at 200 in
    [can-navigate-between-pages.e2e.ts](e2e/can-navigate-between-pages.e2e.ts); `/api/ping` still
    sorts ahead of the rest parameter, verified by the four ping cases in
    [can-see-service-status.e2e.ts](e2e/can-see-service-status.e2e.ts). `/media/*` and `/network/*`
    page grouping is unblocked. Recorded in AGENTS.md under "Config-driven rendering".)_

20. **Add a response-header `Handle`, flip robots.txt, then enable CSP — LANDED.**
    `handleSecurityHeaders` is first in `sequence(...)` and sets `Referrer-Policy`,
    `X-Content-Type-Options: nosniff` and `X-Robots-Tag: noindex` on every response that comes back
    through `resolve`, plus `Cache-Control: private, no-store` on `text/html` alone. robots.txt is
    `Disallow: /`, app.html's pre-paint script carries `nonce="%sveltekit.nonce%"`, and
    `kit.csp.directives` is live in `mode: 'auto'`. The architecture is in AGENTS.md under "The
    response headers and the CSP" and is deliberately not restated here.
    **The one thing worth carrying forward is what this item got WRONG.** It specified
    `Referrer-Policy`, and the value that reads strongest — `no-referrer` — silently 403s the whole
    admin area: appending a request's `Origin` header is referrer-policy-dependent for a non-CORS
    non-GET request, so under `no-referrer` a form POST sends `Origin: null`, kit compares that
    against `url.origin` and answers `Cross-site POST form submissions are forbidden`. Measured with
    curl (403 with `Origin: null`, 200 with the real origin) and caught by the four admin e2e cases
    — which only ran against the real artifact because **#28 landed in the same change**. It is
    `same-origin` now: identical cross-origin leakage, and the same-origin case left alone.
    Two accommodations the item predicted were both required and both correct: the nonce on the
    pre-paint script, and `'style-src-attr': ['unsafe-inline']` for the `--span`, scenery and swatch
    style ATTRIBUTES. Two it did not predict: `img-src` and `form-action` have to allow `http:` and
    `https:` wholesale, because icon hosts and the `BoxSearch` engine come out of a `config.json`
    read from disk at runtime and no build-time list can enumerate them.
    _Known gap, deliberate:_ `handleAdmin` throws its 404 and its 303 above this handle, so those
    two responses carry none of the headers. Closing it means a second mechanism for one 404.

21. **Fix the page's accessibility skeleton and land one axe e2e audit — LANDED.**
    `<header>` is now a SIBLING of `<main>` and maps to `banner`: the old `<main>` became a plain
    `page-shell` div that keeps the padding ramp, the `min-h-screen` and the tall sticky ancestor
    the header needs, and the content-grid div it used to wrap became `<main>`. `@axe-core/playwright`
    and `e2e/is-accessible.e2e.ts` ship: 3 paths × 2 locales, one dark run, one landmark assertion,
    and `color-contrast` over all 27 catalogue entries by theme cookie. The status dot gained a
    silhouette — filled disc / rotated square / hollow outline — so it is no longer colour alone.
    **Three things this item's own plan would have shipped broken, all measured:**
    1. **`.withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])` excludes the entire subject.**
       Against the installed axe-core, `landmark-one-main`, `landmark-banner-is-top-level`,
       `landmark-unique`, `region` and `heading-order` are tagged `cat.semantics,best-practice` and
       nothing else — only `document-title`, `color-contrast` and `link-name` carry a wcag tag. The
       audit is `best-practice` too now, or it cannot go red on the landmarks it was added for.
    2. **Axe cannot fence the banner move at all**, even with those rules on: no rule requires a page
       to HAVE a banner, and `<main>` wrapping everything satisfies `region`. Verified by putting the
       header back inside main — the whole audit stayed green. Hence the explicit
       `getByRole('banner')` test, which does fail on the old markup.
    3. **The 27-theme contrast loop is vacuous on most of the catalogue.** Axe cannot compute a ratio
       against a photograph, so every theme painting a `--background-image` returns 21 nodes
       `incomplete`, 0 passes and 0 violations — measured; `solid-light` gets 19 real passes. The
       loop keeps its assertion but now also requires real passes wherever the theme paints no
       backdrop, so the quiet ones cannot read as checks they are not.
       _And one silent regression the move caused:_ `themes.css` nested
       `.glass-dark main { background-color: rgba(0,0,0,0.2) }` — a scrim that spanned the page only
       because `<main>` did. It targets `.page-shell` now; left on `main` it painted a dark band behind
       the content grid alone.
       _Still open, and not this item's:_ the WCAG 1.4.1 dot defect is closed, but nothing fenced the
       CSP nonce — since closed as #43 — and `document-title` remains invisible to the storybook gate
       by construction.

## Architecture & extensibility

22. **Close the config→DOM prop spread and make the seam fail on a mismatch — LANDED.**
    (a) The `& HTMLAnchorAttributes` / `& HTMLAttributes<HTMLDivElement>` intersections and their
    `{...restProps}` pass-throughs are off `box-service`, `box-date`, `grid` and `dropdown`;
    `sub-grid` needed no edit, because it re-uses grid's now-closed `Props` and its spread forwards
    only declared props. `box-stats` already had neither. **The item's count of six was wrong in both
    directions:** `dropdown`'s was live, as the item's own 2026-08-14 correction said, but it did not
    need the seam — `Props` already declared `class`, so destructuring it was the whole fix.
    (b) Unknown props are now dropped with a warning, and the allowlist is **derived** — the walk
    reads `containerSchemas[name].entries`, the same structural view `containerFields` already uses,
    rather than the hand-written `Record<ContainerName, readonly string[]>` the item asked for. A
    table restating shapes the schema carries is the `requiredProps` duplicate that was deleted once
    already. `items` needs no special case: it is IN `gridProps`, so it is declared for Grid and
    SubGrid and unknown everywhere else.
    (b2) `CONTAINS_CHILDREN` is `Record<NestingName, true>` off
    `Extract<ConfigContainer, { props: { items: ConfigContainer[] } }>`, and `isGrid` reads it with
    `Object.hasOwn`. An incomplete record is TS2741 where the array was just shorter.
    (c) The `Equals<>` assertion lives in `src/lib/presentation/components/config-container.spec.ts`,
    NOT in `config.spec.ts` as the item proposed: business importing `ComponentProps` is the upward
    crossing eslint blocks, so presentation is the only side that may name both layers. It compares
    against the WRAPPERS for BoxService and BoxStats, because those are what the seam actually
    spreads into. Verified the way the item asked — performing the measured escape (`title: string`
    → `heading?: string` with a default) fires it at :55.
    _One consequence for operators:_ a `config.json` carrying a stray key now produces a warning, and
    refuse-on-warnings means `/admin` declines the save and hands over the raw editor. That is the
    designed repair path, but it is a live change for anyone whose file has one.
    _Noticed, not fixed:_ `SubGrid` shares `gridProps`, so the schema declares `title`, the generated
    form offers the field, and `sub-grid.svelte` then overrides it to `undefined` on purpose. That is
    a pre-existing seam wart, not this change's.

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
    _Unblocked:_ #12 landed through this channel. **`no-console` is enableable**
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
35. ~~**A schema-driven form over the containers, not a JSON textarea**~~ — **LANDED**, and three
    of the gaps below landed with it (pages, reorder, type-switch clearing). Generated
    from `containerSchemas` via `containerFields`, arbitrary nesting through a self-referencing
    snippet, and every list has N+1 insertion points so a container can go anywhere in it. The
    architecture is in [AGENTS.md](AGENTS.md) under "Config-driven rendering", including the
    `$state`-proxy trap that makes an added container invisible to both the render and the saved
    file. The raw `<textarea>` did not die — it is now the **repair path**, shown exactly when
    `needsRawEditor` says a save would be refused, because a form can neither save nor fix a file
    whose problem the schema does not describe.
    **Landed since, all presentation-side in [+page.svelte](src/routes/admin/+page.svelte), no
    model change:**
    - **Pages can be added, removed and renamed, and a page's `name` is editable.** The key IS
      the URL path, so renaming rebuilds the `pages` record in place to keep the entry's
      position; a rename that would collide with an existing key or arrive without its leading
      slash never commits, because refuse-on-warnings would make the dropped key block every
      save. Add picks the first free `/new-page` key so two adds cannot merge; an emptied name
      deletes it, which is how the nav falls back to the path.
    - **Containers reorder** — ↑/↓ per fieldset, disabled at the edges, accessible names
      carrying `{target}` + `{position}` like the insertion buttons do. A ±1 move is an
      adjacent swap, written as one whole-value assignment.
    - **Switching a container's type drops the props the new type does not declare** and keeps
      the intersection (`span` survives every switch, `items` survives Grid ↔ SubGrid). This
      stopped being "harmless" when #22 made normalizeConfig warn about every undeclared key:
      refuse-on-warnings turned a leftover `items` into a save the form could never lift.
      **What it deliberately still does not do:**
    - **No `use:enhance`**, so saving is a full page POST, and **the payload is built client-side**
      — without JS the form's edits do nothing and a save rewrites the file's own bytes. Lossless
      in content, but it does re-serialize the file's whitespace.
    - **Insertion positions are 1-based indices over the raw array**, so an entry the form cannot
      render shifts the numbers a sighted operator counts. The ordering itself is correct.
    - **Two sibling containers of the same type give their insertion buttons the same accessible
      name** (`Add container to Grid, position 1` twice, on a page with two Grids). Position
      disambiguates within a list, not between lists that share a parent type. The move buttons
      do not share the flaw — they were named after this note existed.
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

27. **Ship a production invocation that actually loads `.env` — LANDED.**
    README's production path is `node --env-file=.env build`, with the reason stated in place: only
    `npm run dev` reads `.env` — through vite — and nothing in the build output does, so a bare
    `node build` starts cleanly with every `DASHBOARD_SECRET_<NAME>`, `DASHBOARD_ADMIN_TOKEN` and
    `DASHBOARD_CONFIG` silently unset. `engines` is `>=22`, so the flag needs no version caveat.
    `DASHBOARD_CONFIG` is documented as needing to be ABSOLUTE under a service manager, since
    `./config.json` resolves against the process working directory.
    **Only the systemd unit shipped, and that is a measured decision, not a shortcut.**
    [deploy/revie-dashboard.service](deploy/revie-dashboard.service) uses `EnvironmentFile=` rather
    than `--env-file` — one env mechanism per invocation, not two — plus `WorkingDirectory=`, an
    absolute `DASHBOARD_CONFIG` and `ORIGIN`. There is no compose file because the adapter-node
    output is **not standalone**: `build/server/chunks/*.js` import `svelte` and `@sveltejs/kit` as
    bare specifiers and both are `devDependencies`, so `npm ci --omit=dev` breaks the artifact and a
    container needs an image built from the repo. Verified against the on-disk build. A compose file
    is therefore a Dockerfile item of its own, and it would have to ship `build/` plus the FULL
    `node_modules`.

28. **Point Playwright's `webServer` at the shipped artifact — LANDED.**
    `webServer.command` is `npm run build && node build`, with `HOST` / `PORT` derived from the one
    `previewUrl` literal so the IPv4 pinning stays in a single place, and `ORIGIN: previewUrl`.
    **`ORIGIN` is the half the item did not mention and the suite does not start without it:**
    adapter-node's `get_origin` defaults the protocol to `https` when `PROTOCOL_HEADER` is unset and
    never consults the socket, so every POST form gets kit's 403. It is also what made this item pay
    for itself immediately — pointing the suite at the real artifact is what exposed #20's
    `Referrer-Policy: no-referrer` 403ing the admin area, a defect `vite preview` could not have
    shown because it runs no such check. `DASHBOARD_CONFIG` stays relative on purpose: `node build`
    runs from the repo root, and that resolution is now itself under test.
    _Deliberately not done, as the item allowed:_ the `npm run depgraph` diff gate — graphviz output
    is not stable across `dot` versions, so a runner upgrade would fail unrelated PRs.
    _Left behind:_ `npm run preview` now has no caller in the repo.

29. _(**Add two drift-fence node specs: the four hand-mirrored invariants, and doc links** —
    LANDED. [invariants.spec.ts](src/lib/test/invariants.spec.ts) and
    [docs.spec.ts](src/lib/test/docs.spec.ts) live under `src/lib/test/`, run in the `server`
    project, and read the shipped files with every path resolved off the spec's own location rather
    than the process cwd. The export half of the work: SPACING_SCALE is out of the inline
    `extendTailwindMerge` call ([style.ts](src/lib/utils/style.ts)), and the spec holds it against
    the `--spacing-*` declarations tokens.css actually makes. All six fences verified to fail: a
    deleted de key, a dropped spacing entry, a renamed palette class, a deleted `@custom-variant`,
    a missing link target, an anchor past EOF. Three things the item's own text got wrong or left
    out: 47 messages each, not 22, so the fence compares key SETS and pins no count; the palette
    walk has to strip CSS comments first, because themes.css's header names theme.ts and a naive
    scan reads `.ts` as a palette; and the doc fence strips markdown code spans and fenced blocks
    before extracting `](…)` targets — roadmap.md's own prose contains the literal example — and
    skips fragment-only and off-repo (`../zenith`) targets, since CI has not cloned the sibling.)_

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

Everything else portable from zenith maps onto an item above — see #10, #21, #28. The
app.html and reduced-motion ports (#3, #4) have landed, so has the scenery-seed one (#11) and the
wake-listener pair (#18), and so have both items this section held.

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

## New work (2026-08-22)

Its own section for the same reason Service integrations is one: prettier renumbers an ordered
list from its first item, so nothing can be appended to a list above without pulling every later
number up. These six came from reading the shipped app against what a start page is for rather
than from a review pass; like every item here they name their edit points and their refusals,
and each was checked against AGENTS.md so it proposes nothing a recorded decision forbids.

37. ~~**Cover `ThemeStore`'s cookie writes — the gap #30 named and did not fill**~~ — **LANDED.**
    The three cases live in
    [theme-store.svelte.spec.ts](src/lib/business/store/theme-store.svelte.spec.ts) beside the
    six read cases, driven through three buttons the harness grew
    ([theme-store-harness.svelte](src/lib/test/theme-store-harness.svelte)): switching writes the
    theme cookie with the chosen name, rerolling mints a 32-bit seed and persists that exact
    value, toggling writes the flipped preference. The seam is the jar spy this item named,
    taken literally: the spec mocks the repository's writers
    ([appearance-repository.ts](src/lib/data/repository/appearance-repository.ts)), because
    `writeCookie` reads `location.protocol` INSIDE itself for `secure` — `document.cookie`
    cannot be read back with its attributes intact, so the repository's writers are the only
    stable assertion point. One trap the item did not name: the spec is rune-compiled, so NAMED
    imports of the `$`-prefixed writers are a build error (`dollar_prefix_invalid`) — `import
    - as`walks around it, which is the bypass AGENTS.md says the tripwire is bypassable by.
Verified the way the item implied: deleting`updateTheme(newTheme)`from the store fails
exactly the switching case and nothing else.
**#30's second leftover is settled too, by taking it:** the deleted-theme guard in`readRequestAppearance`has two cases in
[appearance.spec.ts](src/lib/business/model/appearance.spec.ts) — a stored theme that
still exists resolves with its own class set, and a cookie naming a deleted theme falls
through with`theme: undefined` and the default's class set.
      _Files:_ src/lib/business/store/theme-store.svelte.spec.ts,
      src/lib/test/theme-store-harness.svelte

38. **Stop a failed stats refresh from parking the tab on the error page** (`M`). The deliberate
    gap #16 recorded: the 60s `invalidate('dashboard:stats')`
    ([+page.svelte:90](src/routes/[...slug]/+page.svelte#L90)) re-runs the WHOLE load, so a tick
    that hits `error(503)` (config caught mid-write) or `error(404)` (a page key renamed under an
    open tab) swaps the dashboard for the error page — and the unmounted page takes its interval
    with it, so the tab stays wrong until a manual reload. The recorded shape is a dedicated
    endpoint the client polls, the shape `/api/ping` already has: POST body names instances,
    allowlist-guarded, readings keyed `provider` + `href`, no credential ever returned — so the
    refresh stops re-running the config half at all. Two decisions on the way: where the interval
    lives (staying on the page keeps the gate that skips installs with no `BoxStats`; moving it
    above the page is what survives the swap), and first paint stays SSR — the TTL cache already
    bounds it. _Not built_, per the standing refusal: any client-side fetch of providers (SSRF
    surface — `/api/ping`'s allowlist is the precedent). _Files:_ src/routes/api/stats/ (new),
    src/routes/[...slug]/, src/lib/business/store/stats-store.svelte.ts

39. ~~**Web app manifest, theme-color and touch icons**~~ — **LANDED.**
    [manifest.webmanifest](static/manifest.webmanifest) names the product ("Revie Dashboard"),
    as the item required — a static file cannot be localized, so `m.app_title()` stays out. Both
    traps held: the CSP needed NOTHING new — `manifest-src` falls back to `default-src: 'self'`
    and the icons ride the existing wholesale `img-src` — so no directive was added; and
    theme-color is two OS-scoped metas in [+layout.svelte](src/routes/+layout.svelte) (the light
    default's white page, and the revie ground the favicon already encodes, for dark), not the
    refused per-theme JS mirror. The icons: the manifest's "any" icon is a byte-copy of the
    favicon at [static/icons/icon.svg](static/icons/icon.svg) — a manifest needs a URL and
    cannot name a Vite-inlined data URI, and the copy says in place that the twin is hand-kept —
    plus two PNGs generated from the favicon's own geometry with the repo's Playwright Chromium,
    there being no ImageMagick on the machine:
    [apple-touch-icon.png](static/icons/apple-touch-icon.png) (180, full-bleed — the OS rounds
    the corners of an app icon, so the SVG's rounded-rect ground became the background gradient)
    and [icon-maskable.png](static/icons/icon-maskable.png) (512, the mark inside the maskable
    safe zone). The generator was a one-off in /tmp, deliberately not committed — a committed
    generator would be a second definition of the mark; if the favicon changes, the PNGs are
    re-derived from it the same way.
    _Files:_ static/, src/routes/+layout.svelte

40. ~~**A weather provider through the existing seam — Open-Meteo**~~ — **LANDED**, and the
    six-edit-point claim held exactly: repository file, registry entry, `providerNames` token,
    `providerNameLabel`, five `StatKey`s with their messages in both catalogues,
    `chrome`/`formats` — and nothing in the route, the store, the cache, the schema-generated
    form or the container branch. What the item did not settle, decided on the way:
    - **The labels carry NO unit, and so does no formatter.** The item's own rule — pin the
      unit system in the href — means presentation cannot know which one was chosen, so a
      hardcoded °C or km/h would lie about the number beside it. A one-decimal `decimal`
      formatter renders the dimensionals, and README tells the operator to pin units into the
      query (`temperature_unit=fahrenheit`) if they want anything but the defaults.
    - **Humidity normalizes to a fraction anyway** (0–100 → 0..1, the blocked-share rule): it
      is dimensionless, so there is no unit system in it to preserve.
    - Five readings ship — temperature, feels-like, humidity, wind speed, precipitation.
      `weather_code` stayed out on purpose: it is categorical, and ~28 WMO-label messages for
      a box that renders numbers is a second catalogue nobody asked for. Geocoding, IP-based
      location and forecast lists stay unbuilt as the item itself refused them.
      Fenced in [open-meteo.spec.ts](src/lib/data/repository/open-meteo.spec.ts) (the href fetched
      VERBATIM, undeclared fields dropped, a half-pasted href refused before fetching),
      stats.spec.ts (the verbatim-vs-fraction line in the projection), and a box-stats story
      asserting 18.7 renders as "18.7" rather than "19" or "18.7°C".

41. ~~**A quick-jump over the configured pages and services**~~ (`M`) — **LANDED.**
    [quick-jump.svelte](src/lib/presentation/components/quick-jump.svelte) mounts beside
    the boxes in `[...slug]/+page.svelte`; the load returns `pages: pageEntries(config)`
    and `services: collectServiceLinks(page.containers)` — plain data, filtered
    client-side against the visitor's locale, no endpoint (every candidate was already
    on the page, as the item refused). Three decisions the item left open:
    - **The trigger is `Ctrl`/`Cmd`+`K`, keyboard-only** — `/` belongs to BoxSearch, and
      a header button would be chrome for a keyboard affordance; touch users keep the
      nav rail. `preventDefault` matters as much as it does there: without it the
      browser moves focus to its own address-bar search.
    - **The dialog semantics are the platform's, not hand-rolled**: a native `<dialog>`
      opened with `showModal`, which is what traps focus and makes the page inert. Two
      measured gaps closed in code: Chromium swallows a `.focus()` issued in the same
      task as the `close()` that hid the field being left, so the restore is deferred a
      task and falls back to `blur()`; and programmatic `close()` restores nothing when
      the palette was opened from a bare page — the common case — so the component
      captures and returns focus itself. Escape closes through the window handler
      rather than the platform close-watcher, which answers real keys but not the
      synthetic keydowns every test driver sends. Svelte 5's `autofocus` implementation
      force-focuses post-mount even inside a CLOSED dialog, so the attribute is absent:
      `showModal`'s own dialog-focusing steps land on the field anyway.
    - **Zero matches** renders a translated line rather than an empty list that reads
      as a broken feed; matching is substring over title AND href (typing a hostname
      finds the box whose title says nothing about it), deliberately no fuzzy-match
      dependency. `collectServiceLinks` differs from `collectServiceProbes` on one
      point, recorded at the collector: `probe: 'none'` bookmarks ARE collected — a
      bookmark is exactly what a jump list exists to offer.
    - **Two story lessons are fences now**: anchor activations inside a storybook canvas
      pointing at internal hrefs replaced the whole iframe page ("browser connection
      closed", taking unrelated tests with it) — both interaction stories use a single
      EXTERNAL service entry, whose activation is a new-tab that never touches the
      document; and every play that opens the palette closes it again, so no modal
      outlives its story in the shared canvas.
      _Files:_ src/lib/business/model/config.ts, src/routes/[...slug]/+page.server.ts,
      src/routes/+layout.server.ts (now shares `pageEntries` with the quick-jump instead
      of restating the name fallback), src/lib/presentation/components/quick-jump.svelte +
      story, README.md

42. ~~**A Dockerfile**~~ (`M`) — **LANDED.** #27's measurement held exactly: the runtime stage
    copies `build/` PLUS the full `node_modules` out of the builder, because
    `build/server/chunks/*.js` import `svelte` and `@sveltejs/kit` as bare specifiers and both are
    devDependencies — `npm ci --omit=dev` there breaks the image rather than shrinking it. Node 22
    bookworm-slim, the official image's built-in `node` user (`--chown=node:node` on the copies; no
    new user invented), `EXPOSE 3000`, and a `HEALTHCHECK` against `GET /api/health`, which answers
    200 or 503 since #23. Four decisions taken on the way:
    - **The healthcheck is node's own `fetch`, not curl.** bookworm-slim ships neither curl nor wget
      and installing one adds an apt package to every future base bump for one request. `r.ok` is
      200–299 only, so the 503 branch exits 1; exec-form CMD so no shell quoting sits between the
      check and the JS. It reads `process.env.PORT ?? 3000`, so an operator who moves the port does
      not silently break the check.
    - **`DASHBOARD_CONFIG` is baked to `/config/config.json`** — a container path convention, the
      same decision as the unit's `Environment=` line ("deployment path, not a secret"). README says
      mount the DIRECTORY there, not the lone file: the editor writes its `.tmp` beside the target
      and renames it into place, which a bind-mounted single file cannot do.
    - **Secrets cannot enter a layer.** `.env*` and `config.json*` lead
      [.dockerignore](.dockerignore) (the config is the internal network map); `ORIGIN`,
      `DASHBOARD_ADMIN_TOKEN` and the `DASHBOARD_SECRET_<NAME>` set pass through `-e` /
      `--env-file` at run time, none baked.
    - **Sources are COPYed before `npm ci`, not after**: `prepare` fires paraglide's compiler, so
      `messages/` and `project.inlang/` must be on disk when it runs. Costs layer-cache precision on
      source changes; `npm ci --ignore-scripts` was considered and refused — esbuild and rollup set
      their native binaries up in install scripts.
      _Still deliberately not built:_ compose — landing the image unlocked #27's sequencing but
      nobody has asked for it — and registry push in CI (nobody has said where images go). This
      environment has no Docker daemon, so the image has never been built; first `docker build` on
      a machine with one is the verification.
      _Files:_ Dockerfile (new), .dockerignore (new), README.md

43. ~~**Fence the CSP nonce**~~ — **LANDED.** One `it` at the end of
    [invariants.spec.ts](src/lib/test/invariants.spec.ts), under its own `the CSP nonce` describe,
    asserting both halves of the invariant: app.html carries `nonce="%sveltekit.nonce%"` on a
    script tag, and svelte.config.js spells out `'script-src'`. Both verified to fail — deleting
    the attribute from app.html fails the first expect, deleting the directive from
    svelte.config.js fails the second, each leaving the rest of the suite green. AGENTS.md's CSP
    section no longer records the hole.
    _Files:_ src/lib/test/invariants.spec.ts

44. ~~**Distinct accessible names for the editor's insertion buttons**~~ — **LANDED.**
    `listTarget` in [admin/+page.svelte](src/routes/admin/+page.svelte) composes `{target}` from
    identifiers only — the page path, then each owning container named by its `title` or
    `subTitle`, falling back to `<type> <slot>` — so `admin_container_add_at({ target, position })`
    needed no new key, as the item required. Three things the item's own plan did not say:
    - **The literal fallback collides.** Two UNTITLED same-type siblings fall back to the same
      type, so the fallback also carries the container's slot in its own list: `/services ·
Grid 2` beside `/services · Grid 3`. The fence demands distinct names and `title` is
      optional on Grid/SubGrid — an untitled pair is the ordinary case, not the edge.
    - **The flaw's real site was the TRAILING insertion point of a children list**, which passed
      the bare parent type — exactly what two freshly added Grids render, so the item's own
      reproduction ("Add container to Grid, position 1" twice) never touched a composed name.
      Every button that appends to one list now says that list's identity and counts within it;
      an intermediate version had the per-child button naming the SIBLING it inserts before,
      which answers a different question than "add to".
    - **The move buttons stay as they were, and the ambiguity the item waved off is real**:
      nested moves still say "Move container up in Grid, position 1" twice when two sibling
      Grids each have a first child. Noticed, not fixed — the item says they stay, and the fence
      does not cover them.
      The fence is 'tells two same-type lists apart in the insertion buttons' in
      [can-edit-the-config.e2e.ts](e2e/can-edit-the-config.e2e.ts): two untitled Grids, then one
      titled, with the old colliding name asserted to reach zero.
      _Files:_ src/routes/admin/+page.svelte, e2e/can-edit-the-config.e2e.ts

45. ~~**Rate-limit `/api/ping`**~~ — **LANDED.** `takePingLimit`
    ([ping-limit.ts](src/lib/business/model/ping-limit.ts)) is [admin-auth.ts](src/lib/business/model/admin-auth.ts)'s
    backoff map reduced to a flat budget: 300 probes per rolling minute per client address, a
    kind plus a number out of the model, the route picking the 429 words. Decisions taken on the
    way: the slot is taken BEFORE the body parses, so a throttled caller costs no work at all;
    every attempt counts, not only allowed ones; the ceiling is sustained rather than lifetime
    (the window draining buys a fresh budget, so the dashboard's own poll can never be locked out
    for good); and it is per-address only, as this item refused globals. **The item's own sizing
    was wrong by an order of magnitude:** "a few dozen a minute" measured at 163 probes in the
    e2e suite's busiest rolling minute — every page load eagerly probes every fixture box, all
    from the one address the browser answers from — and a budget under that shipped six red e2e
    tests before it was measured. It ships at 300, which still caps sustained abuse at a few
    connects a second. _Files:_ src/lib/business/model/ping-limit.ts (new),
    src/lib/business/model/ping-limit.spec.ts (new), src/routes/api/ping/,
    src/routes/api/ping/ping.spec.ts

46. ~~**Enable `no-console`, with the four exemptions**~~ — **LANDED.** `'no-console': 'error'`
    sits in the main rules block of [eslint.config.js](eslint.config.js), and one exemption block
    after every layer block turns it off for
    [+layout.server.ts](src/routes/+layout.server.ts), `[...slug]/+page.server.ts`,
    [service-store.svelte.ts](src/lib/business/store/service-store.svelte.ts) and `scripts/` —
    plus `dps.js` in its own block, until #10 deletes the file with it. Two things worth
    knowing:
    - **Minimatch reads `[...slug]` as a character class**, so the unescaped path in a
      flat-config `files:` glob silently matches NOTHING — the whole directory would have been
      exempt with no error anywhere. It is spelled
      `src/routes/\\[...slug\\]/+page.server.ts`. Verified both ways: a `console.log` probe
      inside that directory but outside the named file errors, and the five real calls in
      `+page.server.ts` pass.
    - **The item's block-wins warning did not bite here**: no layer block names `no-console`, so
      the main block's value survives under every `no-restricted-imports` restatement — the trap
      is specific to a rule a later block redefines. The exemptions still come last, where
      nothing can override them.
      _Files:_ eslint.config.js

47. ~~**An optional `timezone` prop on `BoxDate`**~~ — **LANDED**, both decisions as the item
    wrote them, with one refinement measured on the way. The zone is checked inside the schema,
    so an unknown one drops the container with the standard `"timezone" is missing or not valid`
    warning instead of throwing `RangeError` mid-SSR — but the check is `new
Intl.DateTimeFormat(undefined, { timeZone })` in a try/catch rather than the
    `Intl.supportedValuesOf('timeZone')` lookup the item named: neither `UTC` nor case-variant
    spellings are in that list (417 entries, measured) while Intl formats both, and the probe is
    the exact predicate for "throws later". The prop threads into BOTH formatters, which stay
    instance-scoped and are `$derived` besides — an instance can survive a config refresh with
    only its props patched, and a formatter built at init would keep rendering the old zone.
    One more thing the item did not spell out: `'x'` — the value every other described field is
    fence-filled with — is not a zone, so [config.spec.ts](src/lib/business/model/config.spec.ts)'s
    `fillValue` special-cases the path with `'UTC'`, the first constrained string the walk has
    described. The story pins `Pacific/Kiritimati` and recomputes its expectation from the node's
    own `datetime` attribute, so render tick and assertion cannot disagree about which second
    they are reading.
    _Files:_ src/lib/business/model/config.ts,
    src/lib/presentation/components/box-date.svelte + story, README.md's config section

48. ~~**A feed box — RSS/Atom through a list-shaped container**~~ — **LANDED.** Kept as a
    numbered item because the notes above and below cross-reference it. `BoxFeed` is the
    seventh container: `href` required, optional `limit` (default 10, floored and clamped at
    the box so a hand-edited 0 renders one row rather than reading as a broken feed),
    fetched server-side through the load, cached 5 minutes in `business/model/feed.ts`
    beside `readStats` and keyed by HREF ALONE — there is no provider token, so the URL is
    the whole identity, and two boxes over one feed with different limits share one fetch.
    Failures cross as `failedFeeds: string[]`, the route picking the words from
    `m.feed_load_failed({ href })` behind the same dedupe list the stats toasts use. The
    architecture is in [AGENTS.md](AGENTS.md) under "The feed box" and is deliberately not
    restated here. What belongs here is only what this item's own plan got wrong or left open:
    - **fast-xml-parser is lenient about truncation**, so "did not parse as XML" fires on
      malformed attributes while a truncated or non-feed body lands in the honest
      "without a single readable entry" error instead — measured, both paths asserted.
    - **Entities are NOT decoded inside CDATA** — the XML spec says so, not the parser — so
      the spec asserts a CDATA title arriving literal beside an entity in ordinary text
      arriving decoded. The first draft of that test expected the wrong thing; the parser
      was right.
    - **`parseTagValue` is off**: otherwise `<title>2026</title>` arrives as a number and
      fails validation for being what it honestly said. Asserted.
    - **The e2e covers the failure half only** — the fixture's feed points at the same
      deliberately closed port as its AdGuard box, and `/news` joined `is-accessible.e2e.ts`'s
      audited paths. The success path is fenced by the wrapper stories against a populated
      store, which is exactly where e2e cannot reach ("the fixture's provider port is closed
      on purpose"). One fixture-coupled assertion had to move with it:
      can-edit-the-config.e2e.ts pins the editor's page-key order.
    - **Not built, per the item:** bodies and images; multi-feed aggregation. The *arr
      calendar remains the second consumer this machinery is waiting for.
      _Files:_ src/lib/data/repository/feed.ts (new), src/lib/business/model/feed.ts (new,
      TTL cache), src/lib/business/model/config.ts,
      src/lib/presentation/components/config-container.svelte, box-feed.svelte +
      box-feed-wrapper.svelte + stories (new), messages/en.json, messages/de.json, README.md

## New containers (2026-08-25)

Its own section for the same reason the two above are: prettier renumbers an ordered list from
its first item, so a new group needs a heading to break the list. These three came from asking
what other start pages (Homepage, Homarr, Dashy, Glance) offer that this one does not; like
every item here they name their edit points and refusals, and each was checked against AGENTS.md
so it proposes nothing a recorded decision forbids. One finding needed no item at all: GitHub
releases, YouTube uploads and subreddit feeds are already one `BoxFeed` entry away — README
carries the recipes.

49. **A `BoxCalendar` container: iCal subscriptions through the feed seam** (`M`). The
    consumer #48 said the feed machinery was waiting for: Sonarr and Radarr publish an
    iCal URL, and birthdays, trash collection and school holidays come out of any
    calendar app as `.ics`. The plumbing is BoxFeed's run once more — server-side fetch,
    a TTL cache in `business/model/calendar.ts` keyed by the BARE HREF (no provider
    token, two boxes over one calendar share one read), per-event `safeParse` dropping
    bad VEVENTs instead of failing the box, and `failedCalendars: string[]` riding
    `reportedFailures` beside `failedFeeds`, the route picking the words from
    `m.calendar_load_failed({ href })`. Rows sort SOONEST FIRST — the one way a
    calendar is not a feed — and `limit` slices after the sort with the same
    floor-and-clamp the feed box uses. Edit points mirror #48's list exactly: a
    repository (fetch + parse), the model (cache), a collector beside
    `collectFeedTargets` (bare hrefs, deduped), one `v.object` in `containerSchemas`
    (`href` required, `limit` optional, `span` like every container), one branch before
    [config-container.svelte](src/lib/presentation/components/config-container.svelte)'s
    `never` assert, `box-calendar.svelte` + wrapper + stories, both message catalogues,
    README. Decisions to take on the way, none of them open-ended: the parser is
    HAND-ROLLED VEVENT reading (SUMMARY, DTSTART, DTEND, UID) — RFC 5545 line folding
    and the `;VALUE=DATE` form are the whole of it, and a dependency is a second parser
    to trust for a shape four fields wide; all-day vs timed comes off the value's own
    form, and a TZID the runtime cannot resolve drops THAT EVENT, not the box.
    **Deliberately NOT built:** RRULE expansion (the whole complexity of iCal lives
    there; the *arr feeds emit one VEVENT per episode and expand nothing, so the primary
    consumer never needs it — a recurring birthday shows once, and README says so); a
    `webcal://` scheme rewrite in code (an operator can type `https://`, README notes
    it); any write path (accepting or declining invitations is a different product);
    client-side fetch (standing refusal).
    _Files:_ src/lib/data/repository/calendar.ts (new), src/lib/business/model/calendar.ts
    (new, TTL cache), src/lib/business/model/config.ts,
    src/lib/presentation/components/config-container.svelte, box-calendar.svelte +
    box-calendar-wrapper.svelte + stories (new), messages/en.json, messages/de.json,
    README.md

50. ~~**A `BoxNote` container: static text out of config** (`S`)~~ — **LANDED.** One
    `v.object` in `containerSchemas` (`text` required, `span` like every container),
    one branch before the `never` assert, and [box-note.svelte](src/lib/presentation/components/box-note.svelte)
    — one text node in the standard surface card. Renders VERBATIM with line breaks
    preserved (`whitespace-pre-line`), under the same "operator content, shown as
    written" contract the page names already have — deliberately NOT localized, and
    deliberately NOT markdown: a renderer is a dependency plus an HTML-sanitizing
    surface for a feature nobody asked for, and a note whose `**bold**` shows its
    asterisks is honest about what it is. No `title` prop either, so the heading-depth
    machinery stays untouched — a note is a body, not a section; a heading belongs to
    the Grid above it; the story asserts the absence of any heading element beside the
    literal asterisks. Two things the item's own file list missed: **the editor came
    free exactly as promised** (`containerFields` walked the new schema entry with no
    edit, fenced by `config.spec.ts`'s form-fill cases over `containerNames`), but the
    seam fence did not — `config-container.spec.ts`'s `seams` record is
    `Record<ContainerName, true>` with a runtime key comparison, so a schema entry
    without a fence line fails both svelte-check and that spec. And **no message keys
    were needed anywhere**, the first container with none: nothing in the box is
    interactive or labelled, so both catalogues stayed untouched.
    _Files:_ src/lib/business/model/config.ts,
    src/lib/presentation/components/config-container.svelte, box-note.svelte + story
    (new), config-container.spec.ts (a fence line per the record above),
    config.spec.ts (a dropped note missing `text`), README.md

51. **A `BoxContainers` container: per-container status from Portainer** (`M`). The
    third list consumer, and the one Homepage's docker dashboard answers: a row per
    container — name, state dot, Docker's own status string — read off
    `GET /api/endpoints/<id>/docker/containers/json` with an `X-API-Key` header. It is
    a CONTAINER, not a stats provider, because the shape is a list and the stats seam
    carries `{ key, value }[]` readings; but the credential half is BoxStats' exactly —
    `secret` names a variable read from `DASHBOARD_SECRET_<NAME>` in the route, one per
    instance, an unset one meaning absence-not-toast. One `v.object` in
    `containerSchemas` (`href`, `endpointId`, optional `secret`, `span`) and one branch
    before the `never` assert. The cache keys HREF AND ENDPOINT ID (the `statsKey`
    lesson: two environments behind one Portainer is a real config), its TTL mirrors
    stats' 30 seconds rather than feeds' 5 minutes because containers flip on deploy,
    and validation degrades PER ENTRY like the feed's — one weird object costs itself,
    only an unparseable response fails the box. State dots REUSE BoxService's
    vocabulary (filled disc / hollow outline) so the silhouette rule and the stories'
    a11y gate carry over. **Two walls inherited, not solved:** self-signed TLS excludes
    Portainer from the stats providers for exactly this reason — README repeats the
    real-certificate-or-proxy requirement, and no `NODE_TLS_REJECT_UNAUTHORIZED`
    workaround exists; and **no actions** — start/stop/restart buttons are the first
    write path outside `/admin`, and until something wants them badly enough to argue
    for the allowlist-plus-rate-limit treatment `/api/ping` got, the box reads.
    _Endpoint details transcribed from Portainer's docs, not measured_ — the standing
    caveat every provider on #33's list carries.
    _Files:_ src/lib/data/repository/portainer-containers.ts (new),
    src/lib/business/model/containers.ts (new, TTL cache), src/lib/business/model/config.ts,
    src/lib/presentation/components/config-container.svelte, box-containers.svelte +
    wrapper + stories (new), messages/en.json, messages/de.json, README.md

## Sequencing

The order that matters, beyond the group ranking:

- ~~**#23 before #12**~~ — both landed, in that order. #12's `defaults` warnings went in through
  the channel #23 opened — its `span` half turning out to have been in the tree already — and
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
- ~~**#21 still needs its own axe pass**~~ — landed, and the reasoning held exactly: the storybook
  gate globs every story at `test: 'error'`, but landmarks, heading order across the config
  recursion, `document-title` and the theme palettes only exist on the composed, server-rendered
  page. What the bullet could not have known is that the e2e audit does not see all of them either
  — axe cannot require a `banner` to exist, and it cannot measure contrast over a backdrop image.
  #21 records both, and both are why that file carries assertions beside the audit.
- ~~**#28 before #20**~~ — not planned, but that is the order that mattered, and it is why both
  landed together. #28 points the suite at `node build`, which is the only runtime with kit's
  origin-derived CSRF check; #20's `Referrer-Policy` decides whether a form POST carries an `Origin`
  at all. Under `vite preview` the two never meet, so `no-referrer` would have shipped green and
  broken every admin sign-in in production. A header change and the harness change are the same
  review from now on.
