# AGENTS.md

Revie Dashboard — a self-hosted start page for home services. SvelteKit 2 + Svelte 5
runes, Tailwind 4, Paraglide i18n, `adapter-node`. Every box on the page comes from
`config.json`, which is **read from disk at runtime**, not bundled.

This file is the architecture and the traps. [README.md](README.md) is how to run and
configure it — don't duplicate that here.

## Commands

```sh
npm run dev            # vite dev
npm run check          # svelte-check (expect 0 errors)
npm run lint           # prettier --check + eslint
npm run lint:deps      # dependency-cruiser rules (see "The layer rule")
npm run depgraph       # regenerate dependency-graph.svg (needs graphviz `dot`)
npm run test:unit      # vitest, two projects: node + real chromium
npm run test:e2e       # playwright against a fixture config
npm run build && node build
```

`npm run test:unit -- --run` for one-shot; bare `test:unit` watches.

## Architecture

### The layer rule

**Dependencies point one way, and a read always ends at a store:**

```
data → business → store → UI                 client reads (ping, theme)
data → business → load  → store → UI         SSR reads (adguard, config)
```

The UI never knows where its data comes from. It reads from a store or from props — never
from a repository.

| Layer        | Lives in                                               | May depend on  |
| ------------ | ------------------------------------------------------ | -------------- |
| presentation | `src/lib/components/`, `src/lib/store/`, `src/routes/` | business, leaf |
| business     | `src/lib/business/`                                    | data, leaf     |
| data         | `src/lib/data/`, `src/lib/server/`                     | leaf only      |
| leaf         | `src/lib/utils/`, `src/lib/style/`, `src/lib/assets/`  | nothing        |

Not in the table and constrained by nothing: `src/lib/paraglide/` (generated) and
`src/lib/test/`. The table is the rule set, not a map of `src/lib`.

**Why SSR is the exception, and why it isn't a hole.** A store cannot sit between disk and
a load function: `+page.server.ts` runs in node with no component instance, so no
`setContext` and no runes, and the server must have the data before any HTML exists. So the
load function is the composition root — it's how server data gets _into_ a store. The
component-facing contract is identical either way, which is what
[page.svelte:19](src/lib/components/page.svelte#L19) buys with
`setAdguardStore(() => adguard ?? undefined)`: that thunk is the seam that keeps the SSR
path obeying the same rule as the client path, and it's why it isn't over-indirection.

`src/hooks*.ts` and the route **server** files (`*.server.ts`, `+server.ts`) are that
composition root and may reach any layer. The exemption is deliberately narrow: a
**universal** load (`+page.ts` / `+layout.ts`) also runs in the browser, so it counts as
presentation and may not reach data.

**Config is the carve-out: it stays props, not a store.** `containers` isn't ambient data,
it's the render tree — every level of the `grid` → `config-container` recursion needs its
own subtree, so a store would remove zero prop passing and add a lookup. The store rule is
for **fetched or mutable** data; static structure travels as props.

This is enforced twice, on purpose:

1. **The `$` prefix** on data-layer exports ([appearance-repository.ts](src/lib/data/repository/appearance-repository.ts))
   is a compile-time tripwire: `$` is reserved for runes inside `.svelte` / `.svelte.ts`,
   so naming a data function there is a build error (`dollar_prefix_invalid`). It makes the
   violation loud at the moment you write it.
2. **`npm run lint:deps`** is the actual fence. The tripwire is bypassable — `import * as`
   walks straight around it, which is exactly how the two stores used to reach the
   repositories. A naming convention can only discourage; a rule catches.

Rules live in [.dependency-cruiser.cjs](.dependency-cruiser.cjs). Note the type-only
handling differs per rule, on purpose:

| Rule                                  | `import type` |                                                                     |
| ------------------------------------- | ------------- | ------------------------------------------------------------------- |
| `presentation-not-to-data`            | **forbidden** | naming a repository type is the same coupling; use `business/type/` |
| `data-not-to-business`                | **forbidden** | would invert the layer even in types                                |
| `presentation-not-to-business-values` | allowed       | how a component types its props (`business/type/adguard-stats.ts`)  |
| `lower-layer-not-to-presentation`     | allowed       | lets a helper be typed against what it is handed                    |
| `leaf-not-to-upper-layers`            | allowed       | same                                                                |

> `lint:deps` reports **5 known errors** today, all of them the one registry leak in
> Roadmap → Layer violations. It is deliberately _not_ part of `npm run lint` yet; wire it
> in once it's at zero and it becomes a real gate.

Two cruiser config notes, both non-obvious:

- It needs [tsconfig.depcruise.json](tsconfig.depcruise.json) to resolve `$lib`. The app's
  own `tsconfig.json` can't be used because the `$lib` **`paths`** it inherits from
  `.svelte-kit/tsconfig.json` are written relative to `.svelte-kit/` (`../src/lib`) and
  resolve from the root config's directory instead — pointing outside the repo, so every
  `$lib` import comes back unresolvable. (Pointing cruiser straight at
  `.svelte-kit/tsconfig.json` fails differently, with `TS18003` on its `include` paths.)
- `not-to-dev-dep` is set to `ignore`. SvelteKit keeps every build-time dependency in
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
- **A layer must not swallow.** [business/service.ts](src/lib/business/service.ts) returns
  `Result<boolean>` and does not log: a probe that _fails_ is not a service that is _down_,
  and only the caller knows whether to keep the last known value, toast, or ignore it.
- Reporting is presentation's job, injected: `ServicesStore` takes an
  `ErrorReporter`([service-store.svelte.ts](src/lib/store/service-store.svelte.ts)) that
  defaults to `console.error`. A toast store drops in as
  `setServicesStore(toasts.report)` with no change to the store, business, or the repository.

### Config-driven rendering

`config.json` maps a URL path to a list of containers; a container names a component and
carries its props.

```
config.json ─(disk, mtime-cached)→ server/config.ts
            ─(validate + drop bad)→ utils/config.ts  normalizeConfig
            ─(page data)→ [[slug]]/+page.server.ts
            ─(recurse)→ page.svelte → config-container.svelte → the component
```

- [component-registry.ts](src/lib/utils/component-registry.ts) is the set of names a config
  may use, and it **types** the config. [config-container.svelte](src/lib/components/config-container.svelte)
  is what actually renders, as an explicit `if/else` chain. Both list the same five names,
  and that duplication is load-bearing: a component held in a variable has no statically
  known props, so spreading config props into it would need an `any`. **Adding a component
  means editing both.**
- `Grid` and `SubGrid` nest, so `config-container ↔ grid ↔ sub-grid` is a dependency cycle.
  It's deliberate (recursion), which is why `no-circular` is a warning rather than an error.
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
        ─→ business/appearance.ts                     every decision: does this theme still exist? mint a seed?
        ─→ hooks.server.ts        replaces %theme% / %scenery-paused% in app.html  (classes)
        ─→ +layout.server.ts      passes theme / seed / paused as INIT SEEDS
        ─→ ThemeStore             owns it from here; mirrors every change back to the cookie
        ─→ +layout.svelte         seed → sceneryStyle() → style attribute on .theme-scenery
```

The repository/business split is the one to respect: the repository does parsing and cookie
I/O and **decides nothing**; business makes every decision and owns no cookie names. A new
appearance cookie's name and write belong in the repository, its rules in business.

- The store reconciles **three** sources: the SSR payload, `document.cookie`, and
  `matchMedia`. Read the constructor comments in [theme-store.svelte.ts](src/lib/store/theme-store.svelte.ts)
  before touching it.
- [app.html](src/app.html) has an inline pre-paint script for the _first_ visit (no cookie yet)
  on a dark-preferring or reduced-motion OS. It hardcodes the default dark theme's CSS class
  — keep it in sync with `DEFAULT_DARK_THEME` in [theme.ts](src/lib/business/model/theme.ts).
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
- **The `@theme` spacing scale in [tokens.css](src/lib/style/tokens.css) is hand-mirrored** in
  `extendTailwindMerge` in [style.ts](src/lib/utils/style.ts). If they drift, `cn()` stops
  recognising a spacing class as a conflict and silently keeps both.
- **The import order in [app.css](src/lib/style/app.css) is the cascade order** and is
  load-bearing: `scenery → tokens → base → themes`.
- Those four style files are **ported from the `zenith` project** (`src/lib/presentation/style/`).
  Keep them diffable against it so upstream theme work stays copy-pasteable. `zenith`'s
  shadcn / tw-animate / fontsource imports are intentionally dropped here.
- **A theme lives in three hand-edited places**, plus optionally a fourth:
    1. the `ThemeName` union **and** the `themes` catalogue in
       [theme.ts](src/lib/business/model/theme.ts) — 27 entries, and the two must agree
    2. an `@custom-variant` in [tokens.css](src/lib/style/tokens.css)
    3. a palette class in [themes.css](src/lib/style/themes.css) — **except** the two baseline
       themes: `solid-light` and `solid-dark` (CSS class `dark`) live in
       [base.css](src/lib/style/base.css) instead
    4. optionally a [scenery](src/lib/style/scenery/) file

    The header-dropdown swatch is **not** one of them — it's generated from `theme.css`
    ([+layout.svelte:118](src/routes/+layout.svelte#L118)), which is what keeps it matching the
    real palette. Don't hand-write a swatch.

- **[scenery-seed.ts](src/lib/utils/scenery-seed.ts) draws from two shared PRNG streams, so
  variable _position_ is an invariant within each stream** — `rnd` for everything up to
  `--meridian-ribbons`, `rnd2 = mulberry32(seed ^ 0x9e3779b9)` for everything added after
  (there is also an independent local stream inside `dunesRidgesUrl`). Inserting a variable
  reshuffles the later ones **in that same stream** for every existing user. Append only
  within a stream, or re-seed per theme group and make ordering local (Roadmap).
- Every read of a stored theme must go through `resolveThemeName()`. Cookies outlive deploys;
  a cookie naming a deleted theme resolves to no CSS classes and the app renders unstyled.
- Paraglide **regenerates `src/lib/paraglide/` on every vite run** and typechecks message
  parameters, so a missing translation fails the build rather than the page. That directory is
  gitignored — never edit it. Add keys to **both** [messages/en.json](messages/en.json) (base)
  and [messages/de.json](messages/de.json); currently 16 keys, in sync.

## Conventions

**Where a test belongs.** `*.spec.ts` runs in node, `*.svelte.spec.ts` in real Chromium
(see the two vitest projects in [vite.config.ts](vite.config.ts)). Components and anything
touching the DOM go in the browser project. Test files are not compiled as rune modules, so
they cannot use `$state` / `$effect` — a store whose constructor registers effects has to be
built inside a component.

**Components are tested, wrappers are not.** A wrapper reads a store and forwards props
([box-service-wrapper.svelte](src/lib/components/box-service-wrapper.svelte),
[box-adguard-wrapper.svelte](src/lib/components/box-adguard-wrapper.svelte)); the component
beside it takes the same data as a plain prop and is tested directly.

**One e2e file per feature**, named after it (`e2e/can-change-theme.spec.ts`). Playwright
points the preview server at [e2e/fixture-config.json](e2e/fixture-config.json) via
`DASHBOARD_CONFIG`, so the suite never depends on the services of the machine it runs on:
one host that resolves, one that never does, an AdGuard instance on a closed port.

**Style.** Tabs, single quotes, no trailing commas, 100 cols, 4-wide tabs — prettier owns
it. Comments explain _why_, not _what_; the existing ones are the house style, match their
density.

## Roadmap

Findings from a full architecture review, adversarially verified against the code. Ordered by
what breaks soonest. **Nothing below is fixed** — see "Already done" at the end for what is.

### Correctness

1. **`normalizeContainer` validates the component name and nothing else** — required props
   are unchecked, so `{"name":"Grid","props":{"title":"x"}}` (no `items`) throws in
   `findContainer` on every page load, and a `BoxService` without `img` throws during SSR →
   **500 for the whole page**. Both contradict what README.md promises. Fix in
   [config.ts](src/lib/utils/config.ts) only: default `items` unconditionally for
   `Grid`/`SubGrid`, and drop a container with the existing `console.warn` when a required
   prop is missing. Also add `defaults?:` to the `Config` type — `normalizeConfig` reads a
   key the type doesn't declare.
2. **The AdGuard fetch has no timeout and is awaited in the page load**
   ([adguard.ts](src/lib/data/repository/adguard.ts)). A powered-off box costs undici's 10 s
   connect timeout on _every render_; a host that answers SYN then goes silent costs 300 s.
   Add `signal: AbortSignal.timeout(3000)`; optionally return the promise so the rest of the
   page streams.
3. **`config.json` is git-tracked and is also production's default read path.** A `git pull`
   or `checkout .` during an update silently reverts the live dashboard, and the file holds
   the internal network map. Gitignore it, commit `config.example.json`.
4. **Status dots measure the wrong thing** — `/api/ping` discards the port and probes ICMP,
   so a dead service on a live host stays green, and two boxes on one host always agree.
   Replacing `ping.promise.probe` with `net.connect({host, port})` keyed on `host:port` fixes
   that _and_ drops the `ping` dependency, the fork+exec per unauthenticated POST, an
   unhandled rejection when the `ping` binary is missing from a slim image, and an IPv6 bug
   (`new URL('http://[fd00::5]/').hostname` keeps the brackets).
5. **[app.html](src/app.html) destroys the server-stamped `scenery-paused` class** —
   `className = 'dark'` is a whole-attribute write, and the block that would re-add it is
   gated on the cookie being _absent_, which is false exactly when the server had reason to
   stamp it. Use `classList.remove(…)` / `add(…)`.
6. **"Resume animations" is dead under `prefers-reduced-motion`** — the CSS pauses with
   `!important` and no opt-out, so the button flips its label and nothing moves. Don't render
   it when the query matches.
7. **No keyboard path to any appearance control** — the dropdowns are hover-only, so
   `visibility: hidden` keeps all 27 theme buttons, both locales, reroll and the motion toggle
   out of the tab order. Two classes fix it: `group-focus-within:visible group-focus-within:opacity-100`.
   Note [e2e/dropdown.ts](e2e/dropdown.ts) hardcodes `.hover()`, so no current test can catch this.
8. **box-date builds its `Intl` formatter at module scope from `getLocale()`**
   ([box-date.svelte](src/lib/components/box-date.svelte)) — the module body runs once per node
   process while the locale is per-request, so every SSR response is frozen to the first
   visitor's locale. Move it to instance scope.

### Layer violations (the 5 remaining `lint:deps` errors)

9. **`utils/component-registry.ts` value-imports five components** (5 errors, one fix) — the
   map's only runtime use is `name in componentRegistry`, yet the value import drags the
   component graph into `utils/config.ts`, and from there into `/api/ping`. Fix: `import type`
   the components, back `isComponentName` with
   `const COMPONENT_NAMES = [...] as const satisfies readonly (keyof ComponentRegistry)[]`.
   This is the last error; clearing it lets `lint:deps` go into `npm run lint` as a gate.

### Storybook

10. **Storybook is installed with zero stories** — 8 devDeps, `.storybook/main.ts` +
    `preview.ts`, two npm scripts, and `main.ts` globs `../src/**/*.stories.@(js|ts|svelte)`
    which currently matches nothing. Write the stories rather than deleting the install.
    Good order, cheapest first: [box-date](src/lib/components/box-date.svelte) (no props) →
    [box-service](src/lib/components/box-service.svelte) (one story per `isOnline` state:
    `true` / `false` / `null`) → [box-adguard](src/lib/components/box-adguard.svelte) (with and
    without `stats`) → [dropdown](src/lib/components/dropdown.svelte) →
    [grid](src/lib/components/grid.svelte) / [sub-grid](src/lib/components/sub-grid.svelte)
    (nested containers; the interesting one). Notes for whoever picks this up:
    - Use the presentational components, **not** the wrappers — wrappers need a store in
      context, the components take plain props. This is the same split the unit tests already
      use, so the specs are the reference for prop shapes.
    - Theme classes live on `<html>`, so a story renders unstyled unless `.storybook/preview.ts`
      stamps a theme class on the root. Add a global decorator or a theme toolbar there.
    - `@storybook/addon-vitest` overlaps the existing vitest-browser project. Decide whether
      stories replace the component specs or sit beside them before adding more.
    - `eslint-plugin-storybook` is installed but not referenced in
      [eslint.config.js](eslint.config.js) — add it when the first story lands.

### Cleanup

11. **Wire a toast store into the `ErrorReporter` seam.** `ServicesStore` already accepts one
    and defaults to `console.error`, so a failed ping is reported rather than swallowed — but
    nothing shows it to the user yet. A `ToastStore` in `lib/store/`, set in
    [+layout.svelte](src/routes/+layout.svelte), then `setServicesStore(toasts.report)` in
    [page.svelte](src/lib/components/page.svelte). `AppError.message` is guaranteed renderable,
    so the toast body is `error.message` and nothing else. Do the same for the AdGuard failure
    in [+page.server.ts](src/routes/[[slug]]/+page.server.ts), which still logs and returns
    `null` — the error is available, it just isn't forwarded to the page yet.
12. **Delete the browser cookie re-read in `ThemeStore`** (lines 88–96 + the `browser` import).
    The same cookie was already resolved through the same `resolveThemeName` to produce
    `data.theme` in the same request, so it can only ever equal what was handed in — while its
    early `return` makes the blocks below look conditional when they aren't.
13. **`git rm --cached dps.js`** — unrelated gacha-game DPS math at the repo root that
    `npm run lint` currently walks.
14. **Re-seed scenery per theme group** so variable order stops being global. That deletes the
    second PRNG stream, the "must stay last" guard, and the call-count preservation in
    `dunesRidgesUrl`. Don't pin current output with a golden test — that freezes the invariant
    instead of removing it.
15. **Two missing config warnings**: a non-integer `span` is dropped silently and falls back to
    full width, and a `defaults` key naming an unknown component never matches and never warns.
16. **[src/hooks.ts](src/hooks.ts) is inert** — `reroute` de-localizes for route _matching_, then
    the load reads the still-localized path, so `GET /de/services` 404s. Unreachable today (the
    paraglide strategy has no `"url"`), but adding `"url"` for shareable language links makes
    _every_ page 404 in German. Delete it, or use `config.pages[deLocalizeUrl(url).pathname]`.

### Already done

Not roadmap items — recorded so nobody re-derives them or "fixes" them back.

- **The two stores go through business.** `theme-store` uses
  [business/appearance.ts](src/lib/business/appearance.ts) (`readClientTheme`, `updateTheme`,
  `updateScenerySeed`, `updateSceneryMotion`) and `service-store` uses
  [business/service.ts](src/lib/business/service.ts). Neither imports a repository. The
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
- **Config normalization is unchanged and still unguarded** — roadmap item 1 is real and open.
  `Config` genuinely does not declare `defaults` (only `normalizeContainer`'s parameter is
  typed), so don't assume the earlier note was already applied.
