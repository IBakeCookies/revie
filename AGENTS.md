# AGENTS.md

Revie Dashboard — a self-hosted start page for home services. SvelteKit 2 + Svelte 5
runes, Tailwind 4, Paraglide i18n, `adapter-node`. Every box on the page comes from
`config.json`, which is **read from disk at runtime**, not bundled.

This file is the architecture and the traps. Everything else lives in one of three:

| File                     | What it is                                                    |
| ------------------------ | ------------------------------------------------------------- |
| [README.md](README.md)   | How to run and configure it — user-facing                     |
| [roadmap.md](roadmap.md) | What is still broken or missing; churns as items land         |
| [CLAUDE.md](CLAUDE.md)   | Five lines that `@`-import this file, so the two cannot drift |

Don't add a fifth top-level `.md`, and don't duplicate one of these here. Durable knowledge
gets exactly one home: architecture and invariants here, how-to in `README.md`, open work in
`roadmap.md`. A rule with two homes is the drift the last cleanup was about — see
"Already done".

## Commands

```sh
npm run dev            # vite dev
npm run check          # paraglide + svelte-check (expect 0 errors)
npm run lint           # prettier + eslint + lint:deps (layer rules)
npm run lint:fix       # eslint --fix; run BEFORE `format`, never after
npm run lint:deps      # just the layer rules (also run by `lint`)
npm run paraglide      # compile messages (also chained into prepare + check)
npm run depgraph       # regenerate dependency-graph.svg (needs graphviz `dot`)
npm run test:unit      # vitest, three projects: node, real chromium, storybook
npm run test:e2e       # playwright against a fixture config
npm run test:e2e:ui    # the same suite in playwright's UI mode
npm run storybook      # storybook dev on :6006
npm run build && node build
```

`npm run test:unit -- --run` for one-shot; bare `test:unit` watches. It writes coverage on
every invocation (`coverage.enabled`), so a run is never just the assertions.

The fix order is **`lint:fix` then `format`**, never the reverse: `prettier --check .` is the
first clause of `npm run lint`, so prettier has to be the last tool to touch a file or the
check clause fails on eslint's output.

`paraglide` has its own script because [src/lib/paraglide/](src/lib/paraglide) is gitignored
and **only the vite plugin regenerates it** — so anything that doesn't run vite
(`svelte-check`, a fresh clone, CI) sees unresolved modules until the compiler has run.
Measured: delete the directory and `npm run check` reports 13 errors in 9 files, 0 after one
compile. That is why it is chained into `prepare` and `check`; don't un-chain it. Don't pass
`--strategy` there either — [vite.config.ts](vite.config.ts) passes none, and paraglide 2.x
has no config file for it, so a strategy would have to be spelled in both places
([roadmap.md](roadmap.md) #26).

## Architecture

### The layer rule

**Dependencies point one way, and a read always ends at a store:**

```
data → business/model → business/store → UI    client reads (ping, theme)
data → business/model → load → store   → UI    SSR reads (adguard, config)
```

The UI never knows where its data comes from. It reads from a store or from props —
never from a repository, and never from a model directly.

| Layer            | Lives in                                    | May depend on |
| ---------------- | ------------------------------------------- | ------------- |
| presentation     | `src/lib/presentation/`, `src/routes/`      | business      |
| business (store) | `src/lib/business/store/`                   | model, data   |
| business (model) | `src/lib/business/model/`, `business/type/` | data, leaf    |
| data             | `src/lib/data/`                             | leaf only     |
| leaf             | `src/lib/utils/`                            | nothing       |

`business/store/` is stateful orchestration — runes, context, the reactive holders.
`business/model/` is the pure half: rules and projections, framework-free, callable
from node. **That split is what lets stores live in business without breaking SSR** —
[hooks.server.ts](src/hooks.server.ts) imports `model/appearance.ts`, never a store.
Nothing on the SSR path may reach `business/store/`.

`src/lib/utils/` is the shared leaf, and holds only modules that import nothing
internal at all ([style.ts](src/lib/utils/style.ts),
[useAsyncErrorAsValue.ts](src/lib/utils/useAsyncErrorAsValue.ts)). If a helper
belongs to one layer, it moves there — `presentation/util/` for the scenery
helpers, `business/store/` for the polling loop.

**Why SSR is the exception, and why it isn't a hole.** A store cannot sit between
disk and a load function: `+page.server.ts` runs in node with no component instance,
so no `setContext` and no runes, and the server must have the data before any HTML
exists. So the load function is the composition root — it's how server data gets
_into_ a store. The component-facing contract is identical either way, which is what
[page.svelte](src/lib/presentation/components/page.svelte) buys with
`setAdguardStore(() => adguard ?? undefined)`: that thunk keeps the SSR path obeying
the same rule as the client path.

Note the exemption is narrow. A route **server** file may call `business/model`, but
it may NOT reach `src/lib/data` — a load function is the composition root, not a
licence to call a repository. That is why `readAdguardStats` and `readConfig` are
business functions rather than repository calls inlined into
[+page.server.ts](src/routes/[[slug]]/+page.server.ts).

**Business names no component, in values or in types.**
[business/model/config.ts](src/lib/business/model/config.ts) declares the config
schema itself rather than deriving it from `ComponentProps`. That is deliberate:
`config.json` is a contract with whoever edits it, and deriving it meant renaming a
prop on a component silently changed the file format with no error anywhere. Now
presentation has to satisfy the schema, and the mismatch surfaces at the
`{...container.props}` spread in
[config-container.svelte](src/lib/presentation/components/config-container.svelte) —
the one place the two layers meet. Its `{:else}` branch is a `never` assertion, so
adding a container to the schema without a renderer fails to compile.

**Config is the carve-out: it stays props, not a store.** `containers` isn't ambient
data, it's the render tree — every level of the `grid` → `config-container` recursion
needs its own subtree, so a store would remove zero prop passing and add a lookup.
The store rule is for **fetched or mutable** data; static structure travels as props.

The rules are enforced three ways, on purpose, and the three catch different things:

1. **The `$` prefix** on data-layer exports
   ([appearance-repository.ts](src/lib/data/repository/appearance-repository.ts)) is a
   compile-time tripwire: `$` is reserved for runes inside `.svelte` / `.svelte.ts`,
   so naming a data function there is a build error (`dollar_prefix_invalid`). It
   makes the violation loud at the moment you write it, and it is bypassable —
   `import * as` walks straight around it.
2. **`no-restricted-imports`** in [eslint.config.js](eslint.config.js), one block per
   layer, matching the `$lib/…` **specifier string**. It is the only one of the three
   that sees a **type-only** crossing inside a `.svelte` file: the svelte compiler
   strips `import type` before dependency-cruiser parses the component, so no edge
   exists to flag. Measured — a component doing
   `import type { StoredAppearance } from '$lib/data/repository/appearance-repository'`
   leaves `depcruise src` at 0 errors while eslint reports it. That is why these blocks
   are `error`, and why a persisted type reaches a component through business.
3. **`npm run lint:deps`** resolves modules to disk, so it catches what a string match
   cannot: a relative crossing and a dynamic `import()`.

`no-restricted-imports` is **not additive** across flat-config blocks — the last block
matching a file wins the whole rule — so each layer block restates the relative-import
ban alongside its own patterns. Delete that line from one block and relative imports are
silently unbanned for that subtree only.

The rule messages in [.dependency-cruiser.cjs](.dependency-cruiser.cjs) cite two labels, so
here is what they name:

- **R1 — layers point one way.** The table above: `data → business → presentation`, never
  upward. Whatever a read needs in order to be interpreted is passed in as a parameter, not
  imported from the layer above.
- **R2 — a read ends at a store.** A route or component uses `business/store`; calling a
  model directly puts orchestration in a file no `*.spec.ts` can reach. `import type` is
  fine — it is how a component types its props.

Rules live in [.dependency-cruiser.cjs](.dependency-cruiser.cjs), kept in step with the
`zenith` project so both stay consistent. `lint:deps` runs as part of `npm run lint`
and is at **0 errors and 0 warnings**; keep it there. The file is zenith's, plus two
rules that are each inert in the other repo — so it is a superset, not a byte-copy:

- `leaf-not-to-upper-layers` is ours. zenith has no `lib/utils`, so the leaf needs
  saying out loud here.
- `logger-imports-nothing` is zenith's, ported for comparability and inert here — its
  `from.path` `^src/lib/logger[.]ts$` matches nothing. **Don't create a `logger.ts` to
  give it something to match**; see the `console` note under Conventions.

- `no-circular` is `error`, and `config-container` ↔ `grid` ↔ `sub-grid` is exempted **by
  name** through `from.pathNot`. The cycle is real and unavoidable (config containers nest,
  so the renderer recurses), but all three files have to be listed: dependency-cruiser
  reports a cycle once, from whichever member is _not_ filtered out, so exempting only
  `config-container` just moves the error to `grid` and `sub-grid`. A new cycle joining any
  of the three to a module outside the trio still fails, reported from that outside module.
- `no-orphans` is `error`. Its type-only `pathNot` is
  `^src/lib/(presentation|business|data)/type(s)?/`. Worth knowing that this rule is
  fragile by nature: [dom.ts](src/lib/test/dom.ts) and
  [presentation/util/](src/lib/presentation/util/) are non-orphans **only** because specs and
  components import them, so deleting the last importer now hard-fails `npm run lint` on a
  change that looks unrelated.

Two cruiser config notes, both non-obvious:

- It needs [tsconfig.depcruise.json](tsconfig.depcruise.json) to resolve `$lib`. The
  app's own `tsconfig.json` can't be used because the `$lib` **`paths`** it inherits
  from `.svelte-kit/tsconfig.json` are written relative to `.svelte-kit/`
  (`../src/lib`) and resolve from the root config's directory instead — pointing
  outside the repo, so every `$lib` import comes back unresolvable. (Pointing cruiser
  straight at `.svelte-kit/tsconfig.json` fails differently, with `TS18003`.)
- `not-to-dev-dep` is `ignore`. SvelteKit keeps every build-time dependency in
  `devDependencies`, so that rule is 100% false positives here.

### Errors are values, never exceptions

[useAsyncErrorAsValue.ts](src/lib/utils/useAsyncErrorAsValue.ts) exports
`Result<T> = [AppError, null] | [null, T]` — Go style. Every layer hands a failure **back**
rather than throwing or logging it, so the decision about what a failure MEANS belongs to
whoever holds the state, not to the innermost function.

- `AppError.message` is **required and always a string**, so any failure can be rendered.
  This is load-bearing: the earlier version only set `message` on the non-`Error` branch, so
  every real failure (network drop, HTTP error) produced `message: undefined` and could not
  be shown to a user at all.
- `AppError.cause` is the original thrown value, **for the log only** — never render it.
- A thrown `Error`'s own message wins over the fallback, because the repositories throw the
  specific one (`AdGuard responded with 401 Unauthorized`).
- **A layer must not swallow.** [business/model/service.ts](src/lib/business/model/service.ts) returns
  `Result<boolean>` and does not log: a probe that _fails_ is not a service that is _down_,
  and only the caller knows whether to keep the last known value, toast, or ignore it.
- Reporting is presentation's job, injected: `ServicesStore` takes an
  `ErrorReporter`([service-store.svelte.ts](src/lib/business/store/service-store.svelte.ts)) that
  defaults to `console.error`. A toast store drops in as
  `setServicesStore(toasts.report)` with no change to the store, business, or the repository.

### Config-driven rendering

`config.json` maps a URL path to a list of containers; a container names a component and
carries its props.

```
config.json ─(disk read, no caching)→ data/config.ts
            ─(mtime cache)→ business/model/config-source.ts   readConfig
            ─(validate + drop bad)→ business/model/config.ts  normalizeConfig
            ─(page data)→ [[slug]]/+page.server.ts
            ─(recurse)→ page.svelte → config-container.svelte → the component
```

- [business/model/config.ts](src/lib/business/model/config.ts) declares the names a config
  may use AND their prop schema — business owns the format. [config-container.svelte](src/lib/presentation/components/config-container.svelte)
  is what actually renders, as an explicit `if/else` chain. Both list the same five names,
  and that duplication is load-bearing: a component held in a variable has no statically
  known props, so spreading config props into it would need an `any`. **Adding a component
  means editing both.**
- `Grid` and `SubGrid` nest, so `config-container ↔ grid ↔ sub-grid` is a dependency cycle.
  It's deliberate (recursion), which is why `no-circular` exempts those three files by name
  rather than being turned down to a warning.
  Any _new_ cycle outside that trio is worth a look.
- Config is re-read whenever the file's mtime changes, so edits apply without a restart.
  Nothing in it reaches the Tailwind compiler — see Invariants.

### The appearance pipeline

The subtlest machinery in the app. All three preferences are cookie-backed **so the server
can get the first paint right**, but they arrive by two different routes: theme and
scenery-motion are stamped as HTML **classes**, while the seed travels as layout data and
ends up in a **`style` attribute**. Grepping [app.html](src/app.html) for a seed placeholder
finds nothing.

```
cookies ─→ data/repository/appearance-repository.ts   the 3 cookie names, parsing, and ALL writes
        ─→ business/model/appearance.ts               every decision: does this theme still exist? mint a seed?
        ─→ hooks.server.ts        replaces %theme% / %scenery-paused% + the two
                                  %theme.default*% in app.html                    (classes)
        ─→ +layout.server.ts      passes theme / seed / paused as INIT SEEDS
        ─→ ThemeStore             owns it from here; mirrors every change back to the cookie
        ─→ +layout.svelte         seed → sceneryStyle() → style attribute on .theme-scenery
```

The repository/business split is the one to respect: the repository does parsing and cookie
I/O and **decides nothing**; business makes every decision and owns no cookie names. A new
appearance cookie's name and write belong in the repository, its rules in business.

- The store reconciles **three** sources: the SSR payload, `document.cookie`, and
  `matchMedia`. Read the constructor comments in [theme-store.svelte.ts](src/lib/business/store/theme-store.svelte.ts)
  before touching it.
- `prefers-reduced-motion` is **tracked**, not read once, and its `onMount` is
  unconditional. [scenery/index.css](src/lib/presentation/style/scenery/index.css) pauses motion
  under it with `!important` and no opt-out, so while the OS asks for it there is nothing a resume
  could do — `sceneryMotionToggleable` hides the control rather than let it mislabel a state it
  cannot change, and the OS can flip mid-session. The pause-state _seeding_ off that same query is
  the part that stays one-shot (`initialSceneryPaused === undefined && query.matches`):
  re-seeding on every `change` would overwrite a choice the user has made since.
- [app.html](src/app.html) has an inline pre-paint script for the _first_ visit (no cookie yet)
  on a dark-preferring or reduced-motion OS. It names no theme: `handleTheme` fills
  `%theme.default%` / `%theme.default-dark%` with `JSON.stringify(getClassesToAdd(…))`, so the
  catalogue stays the only definition. The script must `classList.remove(…)` / `.add(…)` rather
  than assign `className` — a whole-attribute write wipes the `scenery-paused` class
  `handleSceneryMotion` already stamped, and the block that would re-add it is gated on the
  cookie being _absent_, which is false exactly when the server had reason to stamp it.
- The scenery seed is minted **server-side** during the root layout load. It has to be: the
  server is the only place that can write it before the SSR'd `style` attribute, and a second
  mint would shift the scenery between server and client.
- `business/model/theme.ts` is deliberately free of runes and of storage, so the SSR path can
  import it without pulling in the client-reactive store.

## Invariants

Things that break **silently** — no error, just wrong output.

- **Config carries tokens, never class names.** Tailwind compiles by scanning source at
  build time, so a class that only ever appears in runtime config produces no CSS and does
  nothing at all. Column width goes through `span` (1–12) → a `--span` custom property →
  the static `xl:col-span-(--span)` utility. Anything new that must be configurable follows
  the same shape: a named token in config, mapped to literal classes in the component.
  `normalizeConfig` strips `class` / `gridClass` from config and warns.
- `spanStyle()` must always emit `--span`. An unset custom property makes `grid-column`
  invalid at computed-value time, which drops the whole declaration.
- **The `@theme` spacing scale in [tokens.css](src/lib/presentation/style/tokens.css) is hand-mirrored** in
  `extendTailwindMerge` in [style.ts](src/lib/utils/style.ts). If they drift, `cn()` stops
  recognising a spacing class as a conflict and silently keeps both.
- **The import order in [app.css](src/lib/presentation/style/app.css) is the cascade order** and is
  load-bearing: `scenery → tokens → base → themes`. There is a second, independent reason
  beyond the cascade: the `@theme inline` block in tokens.css aliases utility names onto the
  **seed** names that base.css declares, so tokens.css is read before its own targets exist.
  Reorder it and the alias layer resolves to nothing.
- **Never write `--color-x: var(--color-x)`.** The alias layer maps a `--color-*` utility name
  onto an **unprefixed seed** (`--ty-primary`, `--line-soft`, …) declared in base.css and
  overridden per theme in themes.css. A self-referential alias only appears to work because of
  the import order above, and it makes the real declaration impossible to find. The two
  exceptions are `--blur` and `--radius`, which Tailwind itself names.
- Those four style files are **ported from the `zenith` project** (`src/lib/presentation/style/`)
  and are kept diffable against it so upstream theme work stays copy-pasteable — 13 of the 17
  shared `scenery/*.css` files are currently byte-identical to zenith's. `zenith`'s shadcn /
  tw-animate / fontsource imports are intentionally dropped here, as are the 10 scenery files
  belonging to themes this project doesn't carry.
- **Tokens only, and never `dark:`.** Components name semantic classes from
  [tokens.css](src/lib/presentation/style/tokens.css) and nothing else — no raw palette class
  (`text-zinc-400`), including inside a class string built in `.ts`. And never the `dark:`
  variant. It does match (`@custom-variant dark`, tokens.css:9) and that is the problem: a
  **binary** across 27 distinct palettes bakes one hardcoded dark look into the themes that
  stamp `dark`, which themes.css then contradicts per theme, and does nothing at all on the
  other 25. A light/dark difference comes from a token the themes already swap. Both hold
  today at 0 violations — written down because the first one costs nothing to break.
- **A translucent surface sitting on the page needs `backdrop-blur`.** All 50
  `--surface-card` / `--surface-inset` declarations in
  [themes.css](src/lib/presentation/style/themes.css) are translucent (`color-mix` or `/ 0.x`),
  none opaque — so without it the theme's background image shows through unblurred while every
  card around it is frosted. So the blur goes on the **surface**, never on a layout wrapper:
  `<main>` and the content wrapper around `{@render children()}` both stay unblurred, and say
  so in place ([+layout.svelte](src/routes/+layout.svelte)). Measured on the six worst dark
  glass themes — a full-width blurred rectangle averages the scenery inside it to a flat wash,
  which erases meridian's ribbons, city-windows' towers and orbit's planet limb wherever the
  page covers them, while a per-surface blur leaves the scenery crisp in the gaps between cards.
  A control nested inside an already-blurred card needs none — `backdrop-filter` makes an
  element a **backdrop root**, so a nested blur cannot reach the scenery anyway; that is why
  [dropdown.svelte](src/lib/presentation/components/dropdown.svelte)'s trigger carries none
  (it only ever sits in the blurred header). The five components that CAN be top-level in a
  config keep theirs, because config decides whether they are nested and no component can know.
- **On the dark glass themes, nesting gets LIGHTER — `--surface-inset` is a white veil.** All
  14 of them pair `--surface-card: oklch(1 0 0 / ~0.06)` with `--surface-inset:
oklch(1 0 0 / 0.1)`, so `Grid` → `SubGrid` → box brightens monotonically. It was a **black**
  veil at `0.15`–`0.35` until 2026-08-04, which inverted the elevation: the box read as a hole
  punched through the two cards above it, and a top-level `BoxDate` / `BoxAdguard` on the page
  vanished outright. The light themes are the other way round on purpose — deeper is slightly
  darker there (`oklch(0 0 0 / 0.05)`, or a hued veil at `0.07`–`0.1`) — so this flip applies
  to dark themes only. `.dark` in [base.css](src/lib/presentation/style/base.css) is opaque and
  already brightens with depth.
- **A theme lives in three hand-edited places**, plus optionally a fourth:
  1. the `ThemeName` union **and** the `themes` catalogue in
     [theme.ts](src/lib/business/model/theme.ts) — 27 entries, and the two must agree
  2. an `@custom-variant` in [tokens.css](src/lib/presentation/style/tokens.css)
  3. a palette class in [themes.css](src/lib/presentation/style/themes.css) — **except** the two baseline
     themes: `solid-light` and `solid-dark` (CSS class `dark`) live in
     [base.css](src/lib/presentation/style/base.css) instead
  4. optionally a [scenery](src/lib/presentation/style/scenery/) file

  Place 2 has its own carve-out: there are **26** `@custom-variant` rules for 27 themes, because
  `solid-light` is the unprefixed `:root` palette and needs no variant to select it.

  The header-dropdown swatch is **not** one of them — it's generated from `theme.css`
  ([+layout.svelte:118](src/routes/+layout.svelte#L118)), which is what keeps it matching the
  real palette. Don't hand-write a swatch.

- **[scenery-seed.ts](src/lib/presentation/util/scenery-seed.ts) draws from two shared PRNG streams, so
  variable _position_ is an invariant within each stream** — `rnd` for everything up to
  `--meridian-ribbons`, `rnd2 = mulberry32(seed ^ 0x9e3779b9)` for everything added after
  (there is also an independent local stream inside `dunesRidgesUrl`). Inserting a variable
  reshuffles the later ones **in that same stream** for every existing user. Append only
  within a stream, or re-seed per theme group and make ordering local ([roadmap.md](roadmap.md) #11).
- Every read of a stored theme must go through `resolveThemeName()`. Cookies outlive deploys;
  a cookie naming a deleted theme resolves to no CSS classes and the app renders unstyled.
- Paraglide **regenerates `src/lib/paraglide/` on every vite run** and typechecks message
  _parameters_ — but a **missing translation fails nothing**. For a locale lacking a key the
  compiler emits `const de_<key> = en_<key>;` and succeeds, so a German page silently renders
  English. (Verified: delete a `de` key, recompile, and the compile is green.) Coverage is not
  checked anywhere. That directory is gitignored — never edit it. Add keys to **both**
  [messages/en.json](messages/en.json) (base) and [messages/de.json](messages/de.json); currently
  17 keys plus `$schema`, in sync — held there by hand until [roadmap.md](roadmap.md) #29 lands.

## Conventions

**Where a test belongs.** `*.spec.ts` runs in node, `*.svelte.spec.ts` in real Chromium, and
`*.stories.svelte` runs in a third project through `@storybook/addon-vitest` — three projects
in [vite.config.ts](vite.config.ts), not two. Components and anything touching the DOM go in
the browser project. Test files are not compiled as rune modules, so they cannot use `$state` /
`$effect` — a store whose constructor registers effects has to be built inside a component.

The `client` project's `exclude` is `src/lib/data/**` where zenith's is `src/lib/server/**`
(there is no `src/lib/server/` here). That line is a **deliberate divergence, not drift** —
copy zenith's over it and the six data-layer specs silently start running in real chromium.

`coverage.exclude` **replaces** vitest's defaults rather than extending them, so
`**/*.{test,spec}.ts` and `**/*.stories.svelte` have to be listed back or the test files are
measured as source and inflate the number. No error, just a wrong figure. There are
deliberately **no `thresholds`** — zenith sets none either, and a floor has to be pinned to a
measured baseline rather than invented.

**Every component has a story, and the story is a test.** Each file in
`presentation/components/` has a `*.stories.svelte` beside it whose `play` functions assert
real behaviour — they run in chromium as part of `npm run test:unit`, so a broken component
fails the suite, not just the storybook UI. **The a11y addon is at `test: 'error'`, so axe runs
against every story and a violation fails `npm run test:unit`.** Keep it there — it is the only
automated a11y gate in the repo, and it earned its place immediately: turning it on surfaced a
`link-name` violation no one had reported (box-adguard's anchor is empty whenever `stats` is
undefined, so it sat in the tab order announcing nothing). Note axe only ever sees a story's
**rest** state, so the states worth an a11y check have to exist as their own stories rather than
being reached inside a `play` function. The one violation it cannot catch is `document-title`
([roadmap.md](roadmap.md) #21) — no component owns `<svelte:head>`.

**Wrappers get a story but no `*.svelte.spec.ts`.** A wrapper reads a store and forwards props
([box-service-wrapper.svelte](src/lib/presentation/components/box-service-wrapper.svelte),
[box-adguard-wrapper.svelte](src/lib/presentation/components/box-adguard-wrapper.svelte)); the
component beside it takes the same data as a plain prop and is tested directly, so a spec would
duplicate it. The story is different — providing the store context is the only thing that
proves the store→prop forwarding, which nothing else covers.

**One e2e file per feature**, named after it (`e2e/can-change-theme.e2e.ts` — `*.e2e.ts`, so
that `testMatch` separates them from the vitest specs). Playwright
points the preview server at [e2e/fixture-config.json](e2e/fixture-config.json) via
`DASHBOARD_CONFIG`, so the suite never depends on the services of the machine it runs on:
one host that resolves, one that never does, an AdGuard instance on a closed port.

The host that resolves is the preview server itself, which is why
[playwright.config.ts](playwright.config.ts) pins **IPv4 on both sides** — `--host 127.0.0.1`,
`webServer.url`, and `use.baseURL` all spell the same literal as the fixture's `href`. Left
unpinned, `vite preview` binds the hostname `localhost`, which resolves to `::1` wherever
/etc/hosts maps it (GitHub's runners do) — the browser follows and the page loads, while
`/api/ping` TCP-connects to the literal `127.0.0.1` the config names and gets ECONNREFUSED,
so `marks a reachable service as online` failed on CI and only on CI. Measured: bind preview
to `::1`, and `POST /api/ping {"href":"http://127.0.0.1:4173"}` answers `{"isAlive":false}`
while `GET /` over `[::1]` answers 200. Note `url` does **not** seed `baseURL` the way `port`
does; drop the explicit `use.baseURL` and every `page.goto('/')` fails with "Cannot navigate
to invalid URL".

**Code.** Named exports only; a default export is for a Svelte component, or for a root
`*.config.*` / `.storybook/` / `*.stories.*` file whose tool dictates it. Import through
`$lib`, never a relative path — including a sibling. Two exemptions, each because the alias
genuinely does not resolve: `./$types` (generated per route by `svelte-kit sync`) and a
route-sibling spec importing the route file itself (`./+server`, `./+page.server`); `e2e/` and
`.storybook/` are exempt wholesale, as neither runs through vite's aliases. `const` over
`let`, early returns over nesting (`max-depth` 3, `no-else-return`). All of it is
[eslint.config.js](eslint.config.js)'s job, at 0 violations — the rules are there so the next
file doesn't start the drift.

**A test with no assertion fails** — `expect.requireAssertions` is on
([vite.config.ts](vite.config.ts)). A spec that builds a fixture and forgets to assert is a
green test that proves nothing, which is worse than no test.

**`console` has exactly four homes, and no lint rule guards them yet.**
`business/model/config.ts` (4 warns), `business/model/config-source.ts` (2 errors),
`business/store/service-store.svelte.ts` (the default `ErrorReporter`), and
`[[slug]]/+page.server.ts` (2 — the operator channel). Measured: a global `no-console` reports
10, the tenth being `dps.js`, which [roadmap.md](roadmap.md) #10 deletes. Six of the nine
are #23's work — they are diagnostics a framework-free model should be **returning**, not
printing — and the reporter is #8's. Don't add a fifth home, and don't reach for zenith's
`no-console: 'error'` + a `logger.ts` to force the issue: the sink seam here is the injected
`ErrorReporter` recorded under "Already done", and a logger module would be a second,
competing seam for the same job. Turn the rule on once #23 and #8 land, with
`+page.server.ts` and the default reporter exempted.

**One definition per concept.** If you catch yourself writing "mirrors", "same as" or "keep in
sync with", export the thing instead. This repo has exactly two exceptions, both documented
above as load-bearing because **no export can span the two sides**: the five container names in
`business/model/config.ts` versus `config-container.svelte`'s `if/else` chain (a component held
in a variable has no statically known props), and the `@theme` spacing scale versus
`extendTailwindMerge` in `style.ts` (one side is CSS). Anything else that reads "keep in sync"
is a bug waiting, not a convention.

**Build the simplest thing that does what was asked.** No abstraction for a second caller that
doesn't exist; extract on the _second_ real duplication. Complexity needs a reachable failure
to justify it — if you can't name the inputs and the wrong outcome, the branch doesn't go in;
"defensive" is not a reason. Comments earn their length: a paragraph defending a decision
usually means the decision is too clever. When you notice something unrelated, say it rather
than fix it — a finding reported costs a sentence, a finding fixed costs a review and a bigger
diff for the thing you were actually asked to do. The standing example is live: six components
spread `{...restProps}` onto real DOM nodes for callers that don't exist
([roadmap.md](roadmap.md) #22). Deleting code to satisfy this is progress, not lost work.

**Style.** Tabs, single quotes, trailing commas where multiline, 100 cols, and **tabWidth left
at prettier's default 2** — [prettier.config.js](prettier.config.js) owns it. `tabWidth` is not
cosmetic under `useTabs`: it is what a tab counts as when prettier measures a line against
`printWidth`, so it decides where the four ported style files wrap. It is omitted here for the
same reason zenith omits it — that is what keeps an upstream paste from failing
`prettier --check`. It was `4` until the zenith parity pass; don't put it back.

The config lives in `prettier.config.js`, **not** `.prettierrc`. Don't reintroduce the latter:
prettier's search finds it first and the first hit wins the _whole_ config with no merge, so
every option in `prettier.config.js` would go silently dead. Same reason not to add a
top-level `"prettier"` key to `package.json`.

`comma-dangle: always-multiline`, `arrow-parens`, `eol-last` and `object-curly-newline`
(`minProperties: 1`, so every object literal puts each property on its own line) are set in
eslint, and `padding-line-between-statements` owns blank lines — the one formatting-adjacent
rule prettier does not fight. All of them sit **after** `eslint-config-prettier` in
[eslint.config.js](eslint.config.js), and that order is load-bearing: eslint-config-prettier
turns those four rules off, so a block that sets them has to come later or the settings are
dead. Prettier and eslint must stay in step regardless — `prettier --check .` runs first in
`npm run lint`, so a disagreement is unsatisfiable.

Comments explain _why_, not _what_; the existing ones are the house style, match their density.

## Roadmap

The open work lives in [roadmap.md](roadmap.md) — 25 open items, all but #33 from three review
passes and adversarially verified against the code, ordered by what breaks soonest. Several are straight ports from
`zenith`, which has already solved them; those items name the upstream files. It is its own file
because it churns as items land, while this one is the architecture and should not. **Nothing in it
is fixed** — the section below is what is.

## Already done

Not roadmap items — recorded so nobody re-derives them or "fixes" them back.

- **The two stores go through business.** `theme-store` uses
  [business/model/appearance.ts](src/lib/business/model/appearance.ts) (`readClientTheme`,
  `updateTheme`, `updateScenerySeed`, `updateSceneryMotion`) and `service-store` uses
  [business/model/service.ts](src/lib/business/model/service.ts). Neither imports a repository. The
  business writers narrow to `ThemeName` on purpose — that's why they aren't pass-throughs.
- **`Result<T>` / `AppError` replaced the old error tuple.** The old shape set `message` only
  on the non-`Error` branch, so every real failure was `message: undefined` and unrenderable.
  Do not reintroduce an optional `message`, and do not add back `code` — it was never assigned.
- **`ServicesStore` takes an `ErrorReporter`.** Business returns the error; the store decides
  to keep the last known state; the reporter decides how a human hears about it. Keep those
  three separate — the earlier version collapsed them and swallowed the error.
- **`.dependency-cruiser.cjs` was rewritten** from the stock `--init` template (which reported
  148 violations, all false, and never resolved `.svelte` so most edges were missing from the
  graph). It now has the five layer rules plus
  [tsconfig.depcruise.json](tsconfig.depcruise.json).
- **The registry is gone; the schema replaced it.** `business/component-registry.ts`
  used to map config names to component types via `ComponentProps`, which made the
  config format a derivative of component internals. Business now declares the schema
  and names no component. Don't reintroduce a `ComponentProps`-derived container type,
  and don't reintroduce `ComponentRegistry` / `ComponentName` — neither name exists in
  `src/` any more. A side effect worth keeping: the five Svelte components no longer
  leak into the `/api/ping` server bundle.
- **`BoxService.title` is required**, in the schema and in `requiredProps`. It was
  optional in the derived type while the component demanded it, so a title-less entry
  passed validation and rendered an empty heading.
- **Stores live in `business/store/`**, not presentation. The reactive holder is only
  half of what a store does; the other half is orchestration, and that is business. The
  split that makes it safe is `model/` staying framework-free for the SSR path.
- **`readAdguardStats` and `readConfig` are business functions.** Route server files
  may not reach `src/lib/data` — see the layer rule.
- **`normalizeContainer` guards required props.** `requiredProps` is a
  `Record<ContainerName, …>`, so registering a container without deciding what it needs is a
  compile error. `items` is set unconditionally for `Grid`/`SubGrid` — a grid written before
  its children renders empty instead of throwing in `findContainer` on the next page load.
  A container missing a required prop is dropped with a warning; its siblings and its parent
  grid survive.
- **`Config` deliberately has no `defaults` field.** An earlier note said to add one; that was
  wrong. `Config` is the NORMALIZED shape, and defaults are consumed during normalization
  (merged into props), so nothing downstream ever sees them. The file format has no type at
  all — it arrives as `unknown`. Adding `defaults` there would describe a shape that never
  exists.
- **The AdGuard fetch is bounded** at 3s via `AbortSignal.timeout`. Without it, the page load
  awaited undici's defaults: 10s for a box that is switched off, 300s for one that answers the
  SYN then goes quiet.
- **The docs were corrected against the code**, so don't restore the old wording from memory or
  from an older checkout. What changed: the seven module paths the `refactor(layers)` commit
  stranded (three were 404 links); the render-pipeline diagram, which named a `server/config.ts`
  that never existed and put the mtime cache in the wrong layer; `Record<ComponentName, …>` →
  `Record<ContainerName, …>`; a phantom `ComponentRegistry` bullet in this very section,
  contradicting the "registry is gone" one above it; the claim that a missing translation fails
  the build (it does not — see Invariants); and the unrecorded `solid-light` `@custom-variant`
  carve-out. [roadmap.md](roadmap.md) #29 is the fence that would have caught all of them.
- **`/api/ping` opens a TCP connection to `host:port`; it does not ICMP the host.** The dot
  claims a service is up, and ICMP only ever answered for the box — a dead service on a live
  host stayed green and two boxes on one host could never disagree. The allowlist is keyed on
  `host:port` for the same reason, so a configured host does not open its other ports. Don't
  reintroduce the `ping` package: it also cost a fork+exec per unauthenticated POST, threw an
  unhandled rejection when the binary was missing from a slim image, and kept the brackets on
  an IPv6 literal (`new URL('http://[fd00::5]/').hostname`). `toEndpoint` strips them.
- **`config.json` is gitignored; [config.example.json](config.example.json) is the tracked
  one.** It is production's default read path _and_ the internal network map, so tracking it
  meant a `git pull` during an update silently reverted the live dashboard.
- **[box-date.svelte](src/lib/presentation/components/box-date.svelte)'s `Intl` formatter is at
  instance scope.** The module body runs once per node process while the locale is per request,
  so hoisting it back freezes every SSR response to the first visitor's locale.
- **The zenith parity pass (2026-08-04) is settled; these are its decisions, not defaults.**
  Tooling was brought in step with `zenith` in one pass. What was taken, and what was
  deliberately refused:
  - **Taken:** `prettier.config.js` at zenith's `tabWidth` accounting; `eslint-config-prettier`
    - `svelte.configs.prettier` with the five rules zenith sets; zenith's cruiser rule set
      (`no-circular` and `no-orphans` at `error`); the CSS seed-name migration; vitest coverage +
      HTML reporters under `test-result/`; zenith's playwright shape; `.storybook/preview.ts`'s
      theme toolbar and scenery mount; a story per component; `.github/workflows/ci.yml`.
  - **Refused, with reasons that still hold:** `no-console: 'error'` and a `logger.ts` (the
    injected `ErrorReporter` is this repo's sink seam, and a logger would be a second one
    competing for the same job); `prettier-plugin-tailwindcss` (measured: 0 files changed at
    this plugin/plugin-svelte pairing, because it does not sort classes in `.svelte`);
    `@typescript-eslint/no-explicit-any: 'off'` and `ban-ts-comment: 'off'` (both are `error`
    here at 0 violations — porting them is a pure loosening); zenith's `--strategy` on
    paraglide, its `tsc -p tsconfig.worker.json`, and its `depcheck` script (our `lint`
    already chains `lint:deps`, which zenith's does not).
  - **The dependency majors landed later (2026-08-04)**, in a security-driven update: eslint
    10, TypeScript 6, Vite 8, dependency-cruiser 18, vite-plugin-svelte 7,
    prettier-plugin-svelte 4, globals 17, vitest-browser-svelte 3. What each cost:
    `@eslint/compat` is **gone** — eslint 10 exports `includeIgnoreFile` from `eslint/config`,
    so the shim had one consumer and no reason to stay. Vite 8 rejects `__dirname` in
    [vite.config.ts](vite.config.ts) under `configLoader: 'native'`, so it is
    `import.meta.dirname` now. vitest-browser-svelte 3 made `render()` **async**, so all 22
    call sites in the `*.svelte.spec.ts` files `await` it and their `it()` callbacks are
    `async` — a sync `render` now yields a `Promise` whose `getByRole` is undefined, which
    `svelte-check` catches. **TypeScript is capped at 6, not 7**: `svelte-check@4` peers
    `typescript@^5 || ^6`, and typescript-eslint 8 peers `<6.1.0`. `@types/node` stays on
    **22** to match `engines.node`, not the 26 that is latest.
  - The vitest 4.x family **cross-peer-pins exact versions**, so `@vitest/coverage-v8` is
    pinned to vitest's exact minor rather than caret-ranged. It moves as one unit or not at
    all; npm's peer check makes any drift a loud `ERESOLVE`, not a silent mismatch. The trap
    is that a **stale `node_modules` also counts** as a pin: npm reads the installed tree as
    "Found", so bumping the family reports `ERESOLVE` even when the manifest resolves cleanly
    from scratch. Regenerate the lock with an empty tree (`npm install --package-lock-only` in
    a clean directory), then `npm ci` — `npm audit fix --force` instead offers
    `@vitest/ui@4.1.10` as "outside the stated range" and is not what you want.
  - **`cookie` GHSA-pxg6-pf52-xh8x (3 low) has no upstream fix and is left open.**
    `@sveltejs/kit@2.70.2` is the latest release and still depends on `cookie@^0.6.0`, so
    `npm audit` reports it on a fully-updated tree; `--force` "fixes" it by proposing
    `@sveltejs/kit@0.0.30`. An `overrides` block pinning `cookie@^0.7.2` clears it and was
    deliberately **refused** — kit's own peer range is the thing to wait on. Re-check when kit
    releases past 2.70.2.
  - `.dependency-cruiser.cjs` is a **superset** of zenith's, not a copy — ours adds
    `leaf-not-to-upper-layers` (zenith has no `lib/utils`) and carries zenith's inert
    `logger-imports-nothing`. A byte-identical shared file would need a matching change in
    zenith, which this pass deliberately did not touch.
- **`src/lib/test/` is under no layer constraint.** No eslint layer block and no cruiser layer
  rule matches it, so [dom.ts](src/lib/test/dom.ts) and
  [adguard-store-harness.svelte](src/lib/test/adguard-store-harness.svelte) may import from any
  layer with nothing to stop them. That is fine for test support and is why they live there
  rather than under `presentation/` — but it means an import _from_ this directory into app code
  would look legal and is not. The harness exists because `setContext` needs a component being
  initialised, so a story wanting its own store has to mount one; setting the store from a
  stories file instead gives every story on the autodocs page one shared context, and the last
  play function to run decides what all of them show.
