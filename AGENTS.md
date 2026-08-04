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
npm run lint:deps      # just the layer rules (also run by `lint`)
npm run paraglide      # compile messages (also chained into prepare + check)
npm run depgraph       # regenerate dependency-graph.svg (needs graphviz `dot`)
npm run test:unit      # vitest, two projects: node + real chromium
npm run test:e2e       # playwright against a fixture config
npm run build && node build
```

`npm run test:unit -- --run` for one-shot; bare `test:unit` watches.

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

Rules live in [.dependency-cruiser.cjs](.dependency-cruiser.cjs), shared with the
`zenith` project so both stay consistent. `lint:deps` runs as part of `npm run lint`
and is at **0 errors**; keep it there. Two deliberate differences from zenith's set:

- `no-circular` is `warn`, not `error`. `config-container` ↔ `grid` ↔ `sub-grid` is a
  real cycle and an unavoidable one — config containers nest, so the renderer has to
  recurse. Any _new_ cycle outside that trio is worth a look.
- `presentation-not-to-business-model` is `error`, not `warn`. zenith keeps it at
  warn because it has a backlog of pages still calling models directly; this repo has
  none, so there is nothing to grandfather.
- `leaf-not-to-upper-layers` is an addition. zenith has no `lib/utils`; this repo
  does, so the leaf needs saying out loud.

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
        ─→ business/model/appearance.ts               every decision: does this theme still exist? mint a seed?
        ─→ hooks.server.ts        replaces %theme% / %scenery-paused% in app.html  (classes)
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
- **The `@theme` spacing scale in [tokens.css](src/lib/presentation/style/tokens.css) is hand-mirrored** in
  `extendTailwindMerge` in [style.ts](src/lib/utils/style.ts). If they drift, `cn()` stops
  recognising a spacing class as a conflict and silently keeps both.
- **The import order in [app.css](src/lib/presentation/style/app.css) is the cascade order** and is
  load-bearing: `scenery → tokens → base → themes`.
- Those four style files are **ported from the `zenith` project** (`src/lib/presentation/style/`).
  Keep them diffable against it so upstream theme work stays copy-pasteable. `zenith`'s
  shadcn / tw-animate / fontsource imports are intentionally dropped here.
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
  card around it is frosted. The page wrapper is the deliberate exception and says so in place
  ([+layout.svelte](src/routes/+layout.svelte)): blurring there would blur the scenery behind
  the whole page. A control nested inside an already-blurred card needs none.
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
  16 keys plus `$schema`, in sync — held there by hand until [roadmap.md](roadmap.md) #29 lands.

## Conventions

**Where a test belongs.** `*.spec.ts` runs in node, `*.svelte.spec.ts` in real Chromium
(see the two vitest projects in [vite.config.ts](vite.config.ts)). Components and anything
touching the DOM go in the browser project. Test files are not compiled as rune modules, so
they cannot use `$state` / `$effect` — a store whose constructor registers effects has to be
built inside a component.

**Components are tested, wrappers are not.** A wrapper reads a store and forwards props
([box-service-wrapper.svelte](src/lib/presentation/components/box-service-wrapper.svelte),
[box-adguard-wrapper.svelte](src/lib/presentation/components/box-adguard-wrapper.svelte)); the component
beside it takes the same data as a plain prop and is tested directly.

**One e2e file per feature**, named after it (`e2e/can-change-theme.spec.ts`). Playwright
points the preview server at [e2e/fixture-config.json](e2e/fixture-config.json) via
`DASHBOARD_CONFIG`, so the suite never depends on the services of the machine it runs on:
one host that resolves, one that never does, an AdGuard instance on a closed port.

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

**Style.** Tabs, single quotes, trailing commas where multiline, 100 cols, 4-wide tabs —
prettier owns it, and `comma-dangle: always-multiline` in eslint names the same intent where a
reader looks for rules. The two must stay in step: `prettier --check .` runs first in
`npm run lint`, so a disagreement is unsatisfiable. Comments explain _why_, not _what_; the
existing ones are the house style, match their density.

## Roadmap

The open work lives in [roadmap.md](roadmap.md) — 32 items from three passes, each adversarially
verified against the code and ordered by what breaks soonest. Several are straight ports from
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
