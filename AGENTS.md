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
npm run screenshot     # rebuild, then reshoot docs/screenshot.png from config.example.json
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
compile. That is why it is chained into `prepare` and `check`; don't un-chain it.

**`--strategy` IS spelled there, and it has to match [vite.config.ts](vite.config.ts) exactly.**
Both read `cookie globalVariable preferredLanguage baseLocale`. Paraglide 2.x has no config file,
so the strategy can only be an argument — and the two generators are used by different tools:
`dev` / `build` / `storybook` / `vitest` compile through the plugin, while `check`, `prepare`, CI
and a fresh clone compile through the CLI. Measured with the flag on the plugin only: one
`npm run paraglide` rewrote `runtime.js` with `preferredLanguage` dropped, so SSR resolved the
locale differently depending on which tool had last generated
[src/lib/paraglide/](src/lib/paraglide). That is the third of the repo's three sanctioned
duplications — see "One definition per concept" under Conventions.

## Architecture

### The layer rule

**Dependencies point one way, and a read always ends at a store:**

```
data → business/model → business/store → UI    client reads (ping, theme)
data → business/model → load → store   → UI    SSR reads (stats, config)
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
`setStatsStore(() => stats)`: that thunk keeps the SSR path obeying
the same rule as the client path.

Note the exemption is narrow. A route **server** file may call `business/model`, but
it may NOT reach `src/lib/data` — a load function is the composition root, not a
licence to call a repository. That is why `readStats` and `readConfig` are
business functions rather than repository calls inlined into
[+page.server.ts](src/routes/[...slug]/+page.server.ts).

**Business names no component, in values or in types.**
[business/model/config.ts](src/lib/business/model/config.ts) declares the config
schema itself rather than deriving it from `ComponentProps`. That is deliberate:
`config.json` is a contract with whoever edits it, and deriving it meant renaming a
prop on a component silently changed the file format with no error anywhere. Now
presentation has to satisfy the schema, and the mismatch surfaces at the
`{...container.props}` spread in
[config-container.svelte](src/lib/presentation/components/config-container.svelte) —
the one place the two layers meet — but only since #22 took the `& HTMLAnchorAttributes` /
`& HTMLAttributes` intersections off the components, which had been swallowing every mismatch.
The spread still cannot catch one escape, because TypeScript does not excess-property-check a
spread of a typed VALUE: renaming a REQUIRED prop errors, renaming it to an OPTIONAL one with a
default does not. That is what
[config-container.spec.ts](src/lib/presentation/components/config-container.spec.ts) fences, with
an `Equals<>` per container against the WRAPPERS the seam actually spreads into. It lives in
presentation because business importing `ComponentProps` is the upward crossing eslint blocks, and
it is a plain `*.spec.ts` — no DOM, the component imports are types and are erased — so it does not
join the two `*.svelte.spec.ts` files the convention below counts. Its `{:else}` branch is a `never` assertion, so
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
  fragile by nature: [presentation/util/](src/lib/presentation/util/) is a non-orphan **only**
  because components import it, so deleting the last importer hard-fails `npm run lint` on a
  change that looks unrelated. That is not hypothetical — trimming duplicated component specs took
  `spanOf`'s last importer with it and lint failed on `src/lib/test/dom.ts`. The orphan was
  **deleted**, not kept alive by re-adding the assertion that imported it: a helper whose only
  reader is a test that shouldn't exist is precisely what the rule is for.

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

- `AppError.message` is **required and always a string**, so any failure is reportable. This is
  load-bearing: the earlier version only set `message` on the non-`Error` branch, so every real
  failure (network drop, HTTP error) produced `message: undefined` and could not be reported at
  all.
- `AppError.cause` is the original thrown value, **for the log only** — never render it.
- **Config loading obeys this too, and that is what closed #23.** `normalizeConfig` returns
  `{ config, warnings }` and `readConfig` returns `ConfigRead` — `{ config, warnings, error,
mtimeMs, isFresh }`. Neither prints. `isFresh` is true only on the call that actually
  re-read the file, which is what turns the diagnostics into **one log per stamp** instead of
  one per request: both `+layout.server.ts` and `[...slug]/+page.server.ts` call `readConfig`,
  and both log only when it is set. Two concurrent first hits can still log twice; an in-flight
  promise cache to dedupe that race is more machinery than one duplicate pair is worth, and it
  is written down here so nobody adds one. `GET /api/health` is the same values read a second
  way — 200 with page count and mtime, 503 with the message.
- **`useAsyncErrorAsValue`'s second parameter is `context`, and it COMPOSES** —
  `${context}: ${thrown}`, with either half standing alone. It used to be a _fallback_ the thrown
  message beat, so every call site's context was silently discarded: the probe diagnostic logged
  undici's bare `fetch failed`, naming no service, which is the one thing that log exists for.
  Neither half is enough alone — `fetch failed` names nothing, the context alone loses
  `401 Unauthorized` — so don't restore the contest.
- **A layer must not swallow.** [business/model/service.ts](src/lib/business/model/service.ts) returns
  `Result<boolean>` and does not log: a probe that _fails_ is not a service that is _down_,
  and only the caller knows whether to keep the last known value, toast, or ignore it.
- **`AppError.message` is for a LOG, not for an eye — no copy crosses a layer.** This is the
  rule the whole reporting path is built on, ported from zenith: raising a toast is
  presentation's job and **so is the wording**. A message minted in `data` or `business`
  (`fetch failed`, `AdGuard responded with 401 Unauthorized`) has no locale available to it and
  never will, so rendering one puts an English line on a German page with nothing short of this
  rule to fix it. What crosses a layer is **data or a kind**, never a sentence:

  | Producer                           | Hands over                                   | Words chosen by                                              |
  | ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
  | `ServicesStore`                    | `NotifyProbeFailed = (href: string) => void` | `[...slug]/+page.svelte`: `m.service_probe_failed({ href })` |
  | the stats load and POST /api/stats | `failedStats: { key, provider, href }[]`     | the same route: `m.stats_load_failed({ provider, href })`    |

  So `ServicesStore` keeps its own `console.error(err.message, …)` **unconditionally** — that
  is a diagnostic, and a diagnostic has a fixed sink — while the injected half carries the href
  alone. The notify default is a no-op precisely because the log fires either way, so nothing is
  swallowed. Zenith's own seams are `() => void` (`NotifyHistoryLoadFailed`) and its variants
  are kinds (`StorageErrorKind`); its `logError` is what our `console.error` stands in for,
  because AGENTS.md refuses a `logger.ts` here.
  [ToastStore](src/lib/business/store/toast-store.svelte.ts) therefore takes a **finished
  string** and is translation-blind, which is what lets it live in business at all.
  The fence is the German case in
  [can-see-provider-stats.e2e.ts](e2e/can-see-provider-stats.e2e.ts) — verified to fail, and to be
  the only thing that fails, when that call site is given a literal instead of a message.
  `message`'s own doc comment in
  [useAsyncErrorAsValue.ts](src/lib/utils/useAsyncErrorAsValue.ts) now says the same thing. It used
  to read "safe to show a user. A toast renders it verbatim" — the first attempt below, written
  into the type itself, which is what kept the wrong version re-derivable from the code alone.
  **What was NOT built:** zenith's `showToastAfterReload` / `flushPendingToasts` sessionStorage
  queue (~90 lines and a hand-rolled validator to survive a `location.reload()` this app never
  does) and its 4-entry `showToast` severity map over `svelte-sonner`. The rule ported; the
  plumbing did not.

- **`ToastStore.show` untracks its own body, and that is load-bearing:** the route calls it
  from inside an `$effect` (the failure list the load returned), and both the dedupe check and
  the `push` READ the message array — so the effect subscribed to it and dismissing a toast put
  it straight back. Reproduced end to end. **It is no longer fenced, and that is worth knowing
  before you delete it**: the dismiss case in
  [can-see-provider-stats.e2e.ts](e2e/can-see-provider-stats.e2e.ts) was the fence, and #16's
  `reportedFailures` now `continue`s in that effect _before_ `show`, so the e2e passes with
  the `untrack` removed. Nothing detects its removal — `untrack` outside an effect is a
  pass-through, so neither remaining caller (the probe notify fires after an `await`, outside
  any tracking scope) can register one, and no node spec can either. It stays because the next
  in-effect caller will not arrive with an episode flag of its own.

### Config-driven rendering

`config.json` maps a URL path to a list of containers; a container names a component and
carries its props.

```
config.json ─(disk read, no caching)→ data/config.ts
            ─(stamp cache)→ business/model/config-source.ts   readConfig
            ─(validate + drop bad)→ business/model/config.ts  normalizeConfig
            ─(page data + diagnostics)→ [...slug]/+page.server.ts
            ─(one log per stamp)→ +layout.server.ts / [...slug]/+page.server.ts
            ─(recurse)→ page.svelte → config-container.svelte → the component
```

- [business/model/config.ts](src/lib/business/model/config.ts) declares the names a config
  may use AND their prop schema — business owns the format. [config-container.svelte](src/lib/presentation/components/config-container.svelte)
  is what actually renders, as an explicit `if/else` chain. Both list the same six names,
  and that duplication is load-bearing: a component held in a variable has no statically
  known props, so spreading config props into it would need an `any`. **Adding a component
  means editing both.**
- **The schema is a valibot value, and every config type is inferred from it.**
  `containerSchemas` is the one declaration; `ContainerName` is its `keyof`,
  `ConfigContainer<N>` is a mapped-then-indexed type over it, and `isContainerName` is
  `Object.hasOwn` against it. There used to be a second, hand-written copy of the same
  shapes — a `requiredProps` table — and nothing forced the two to agree. Two things resist
  full inference and are closed at the type level instead, both deliberately: a Grid's
  `items` (a container schema naming itself is a TS circular-inference failure, and children
  must be parsed one at a time so a bad child doesn't fail its parent grid) and `ConfigPage`
  (`pageSchema` is honestly file-facing — `v.array(v.unknown())` — because nothing there has
  checked that the entries are containers yet). Validation is always `safeParse`, never
  `parse`: a hand-edited file has to degrade.
- **The warning sentences are asserted, so they are part of the contract.** They are minted
  here, not taken from valibot — `v.getDotPath` names the prop and the sentence is ours.
  `BoxService.img` is spelled `v.optional(v.object({ src: v.string() }), {} as { src: string })`,
  a deliberately invalid default that walks a missing `img` one level deeper so the warning
  names `img.src` rather than stopping at `img`. That is a type assertion earning its keep on
  a technicality, and it is allowed **because `config.spec.ts` asserts both the drop and the
  path** — if a valibot change ever stopped validating defaults, the test fails loudly instead
  of silently turning a required prop optional.
- **`BoxSearch` is the first container a VISITOR can type into, and that is the only thing
  interesting about it.** Every other `<form>` and `<input>` in the tree belongs to `/admin`,
  behind the shared token; this one renders on a page anybody on the LAN loads. It is still
  **no server code at all** — a `method="get"` form whose `action` is config's `href`, so the
  browser navigates to the engine and this app never sees the query. Four decisions:
  1. **The parameter name `q` is hardcoded in the component, not a prop.** Whoogle, SearXNG,
     Google and DuckDuckGo all read it, so a prop would be a second caller that does not exist.
     The consequence belongs to the operator and cannot be fixed in code: **a GET submission
     REPLACES the action's query string**, so an href like `https://duckduckgo.com/?ia=web`
     silently loses `ia=web`. README.md says so, because only the docs can.
  2. **`rel="noreferrer"` on the form.** The dashboard's URL is an internal address — a hostname
     and port on someone's LAN — and a search submission is the one navigation in the app that
     routinely leaves it for the public internet.
  3. **The `/` shortcut must `preventDefault`, and that is not tidiness.** The character is
     inserted against whatever is focused by the keypress stage, which is the field this handler
     just focused, so an unprevented slash opens the box pre-filled with one — and opens
     Firefox's quick find on the way. It also has to skip a keystroke aimed at an `input`,
     including its own, or a typed slash never reaches a query.
  4. **`aria-label` from `search_label`, never a literal, and the same message is the
     placeholder's fallback.** A placeholder is not an accessible name — axe's `label` rule is
     what caught the same shape on `box-stats`' anchor — and one message doing both means a
     config that leaves `placeholder` out still gets a box that says what it is. There is no
     submit button: one field that blocks implicit submission is all it takes for Enter to
     submit, so **a second field would silently end that.**
- `Grid` and `SubGrid` nest, so `config-container ↔ grid ↔ sub-grid` is a dependency cycle.
  It's deliberate (recursion), which is why `no-circular` exempts those three files by name
  rather than being turned down to a warning.
  Any _new_ cycle outside that trio is worth a look.
- Config is re-read whenever the file's `{ mtimeMs, size }` stamp changes, so edits apply without
  a restart. Size as well as mtime because mtime alone is not evidence of sameness — `cp -p` and a
  coarse mtime tick (drvfs, some network volumes) both serve a changed file forever. Be honest
  about what that buys: it **narrows** the staleness window, it does not close it, and a same-size
  edit within one tick is still served stale. Closing it means hashing the bytes, which costs a
  full read per request and so destroys the only thing the cache buys. A read FAILURE is cached
  against its stamp too, so a broken `config.json` costs one read + parse + log per mtime instead
  of per request, and still recovers when the file is fixed.
  Nothing in it reaches the Tailwind compiler — see Invariants.
- **The write path is the read path in reverse, and it writes the operator's bytes.**
  `$writeConfigFile` → `writeConfig` → the `/admin` `save` action. Four decisions:
  1. **The submitted text is written VERBATIM, never re-serialized from `Config`.** The
     normalized shape has already dropped `defaults`, every key the schema does not name
     and every container it rejected — writing it back destroys the operator's file. Same
     reason `load` hands the editor `$readConfigText`'s bytes rather than `readConfig`'s
     config: an operator who opens the editor must find their own file.
  2. **`writeFile` to a `.tmp` beside the target, then `rename`.** A plain write
     interrupted mid-flight leaves truncated JSON, which the read path survives in memory
     but a restart does not — it would serve `emptyConfig` and blank the dashboard. Beside
     the target so both are on one filesystem, which is what makes the rename atomic.
  3. **A write is REFUSED when `normalizeConfig` returns warnings**, not written-and-warned:
     every warning names something that would have been dropped, so writing anyway is how
     an operator loses a box without being told. That is what #23 bought. It has a
     consequence — a config already on disk that produces a warning can never be saved from
     the editor, not even unedited — so `config.spec.ts` asserts both shipped configs
     (`config.example.json`, `e2e/fixture-config.json`) normalize warning-free.
  4. **`not-an-object` is its own rejection kind**, because `[]`, `null` and `"x"` are all
     valid JSON that `normalizeConfig` accepts in silence: `fileSchema` falls back to no
     pages and warns about nothing, so the write would go through and blank the dashboard.
     Reachable through a form is what makes it worth a guard — on the read path it takes a
     deliberate hand-edit. Calling valid JSON invalid would lie to the one person who has to
     fix it. The guard is `writeConfig`'s own, NOT a new `normalizeConfig` warning: those
     sentences are contract, asserted by `config.spec.ts`.

  There is no cache invalidation, and adding one is a second mechanism for the same job —
  the write moves the file's stamp, so `readConfig` re-reads by itself.

- **The admin diagnostics are the one sanctioned crossing of the no-copy rule.**
  `ConfigWrite.rejection` is a KIND (`'invalid-json' | 'not-an-object' | 'warnings' |
'write-failed' | null`) and the route picks the words, exactly like `failedStats` — but
  `warnings` rides along as `normalizeConfig`'s own English sentences and `/admin` renders
  them verbatim. The carve-out: the admin area's only audience is the operator who set
  `DASHBOARD_ADMIN_TOKEN` and reads the server log, and these are the same sentences in the
  same words, so the framing is Paraglide and the diagnostic lines are the log. Rendering
  them anywhere a visitor can reach is still the defect the rule exists for. `AppError`
  deliberately does not cross: it has no sink on this page — presentation cannot render
  `message` and `/admin` is not one of the three `console` homes — so a parse or write
  failure becomes a kind and its message is dropped.
- **The editor's form is GENERATED from the schema, which is the only reason a container
  isn't a fourth edit point.** `containerFields` walks `containerSchemas`' runtime nodes
  (`entries` / `wrapped` / `default` / `type`) into plain data — `{ path, kind, isRequired }`
  — so adding a container to the schema and to `config-container.svelte` makes it appear in
  the editor with no third edit, and `config.spec.ts` asserts that rather than asserting six
  hardcoded names. Four things about it:
  1. **Valibot's internals stop in business.** The walk reads the schemas through one
     structural `SchemaNode` type that is **assigned** from `containerSchemas` rather than
     asserted, so a schema shape the walk cannot read is a compile error. `lint:deps` then
     refuses a route component value-importing the model at all (R2), so the descriptions
     cross through the `load` as props — the same carve-out `containers` itself uses: static
     structure travels as props.
  2. **An `optional` with a default keeps what is under it required.** That is what makes
     `BoxService.img`'s deliberately invalid `{} as { src: string }` produce a required
     `img.src` field, the same technicality the warning path depends on.
  3. **The recursion is a self-referencing `{#snippet}` in the route, not a component.**
     Containers nest arbitrarily, and a second component would have joined the
     `config-container ↔ grid ↔ sub-grid` cycle that `no-circular` exempts **by name** — a
     fourth member means editing that exemption. A snippet adds no module edge at all.
  4. **An `enum` is a kind of its own, and it had to become one.** `probe` is the first
     container prop that is neither a free-form string nor a number, and the walk hands over
     `options` — the picklist's own values — so the form renders a `<select>` rather than a
     text box. Without them the editor offers a field whose every near-miss is a REFUSED save,
     for a prop the form itself invited. It is also what made the drop warning read `is
missing or not valid` rather than `not a string`: `probe` is the first prop where a
     value can be a string and still be rejected. The fence is in `config.spec.ts`, which
     fills every described field and asserts zero warnings — an enum filled with the `'x'`
     every other kind accepts is a dropped container, so that spec fails if `options` ever
     stops being carried. A `v.boolean()` would hit the identical wall.
  5. **`$state` wraps an assigned array or object in its own proxy**, so writing through the
     reference that went IN mutates the raw target behind it, where neither the render nor
     the payload will find it. Adding a container therefore assigns a whole new array
     (`slice(0, i)` + the new entry + `slice(i)`, which is also what gives every position an
     insertion point) and the `record()` helper reads a created object back out of its parent.
     Measured: pushing instead produced a container that rendered nowhere and was silently
     absent from the saved file.
- **The form is skipped entirely for a file it cannot represent, and `reviewConfig` is the one
  predicate.** `writeConfig` is `review → write`, and `needsRawEditor` is the same review
  asking whether the rejection is non-null — so the editor shows a raw `<textarea>` exactly
  when a save would be refused. That is not a second JSON editor competing with the form: it
  is the repair path, and without it refuse-on-warnings is a dead end. A file with an
  undeclared container, an entry that is not a container, a stripped `class` or a bad span
  cannot be saved from a generated form AND cannot be fixed in one, because the form only
  offers what the schema declares — so the operator would be stuck with a config that blocks
  every other edit and no way to reach what is blocking it. One predicate covers all of them
  without enumerating any. The choice is made from the bytes on DISK, so fixing the file
  brings the form back on the next load.
- **`defaults` carries props, never structural keys.** `items` is stripped from every
  `defaults` entry with a warning, once at the root of `normalizeConfig`: a default `items` is
  re-supplied to each child it produces, which inherits it again until the stack goes — and no
  schema can catch it, because the merge happens before the parse.
- **A `defaults` KEY is checked against the container names, and an entry that is not a set of
  props warns too.** Both were silent skips. The merge only ever looks `defaults[raw.name]` up
  for a name the schema already knows, so a misspelled key (`BoxServices`) is not a merge that
  fails — it is a merge that never happens, and the operator's defaults simply never apply with
  nothing anywhere to say so; `defaults: { BoxService: "x" }` went the same way. Both sentences
  are minted in the model and returned in `warnings`, never printed, and both fire **once per
  `defaults` entry at the root** — the same place and the same rule the `items` strip above uses,
  so one bad entry reports once instead of once per container that inherits it. The consequence
  ties into refuse-on-warnings: a warning now routes the operator to `needsRawEditor`'s raw
  `<textarea>`, which is the designed repair path for exactly the file a generated form cannot
  represent. Both shipped configs still normalize warning-free — `config.example.json`'s
  `defaults.BoxStats` and `e2e/fixture-config.json`'s `defaults.BoxService` — so both stay
  saveable from `/admin`, which is what `config.spec.ts` asserts.
- **A `pages` key is a URL path, and the route is `[...slug]`** — a rest parameter, so
  `/media/plex` and other grouped paths match. It was `[[slug]]`, whose compiled pattern
  (`/^(?:\/([^/]+))?\/?$/`) took one segment: a nested key rendered as a nav link and then
  answered SvelteKit's generic `Not Found`, never reaching the configured 404 message. A rest
  parameter still matches `/`, and the static `/api/ping` sorts ahead of it. `normalizeConfig`
  **drops** a key without a leading slash rather than warning about it, because the nav links
  straight to the key: `noslash` visited from `/services` emits a relative href that resolves
  under it, and a link that navigates somewhere else is worse than no link.

### The stats providers

One container reads live numbers off a service — `BoxStats`, with a `provider` token —
rather than one container per vendor. A dozen names would be a dozen schema entries, a
dozen branches before `config-container.svelte`'s `never` assert and a dozen components;
a token keeps presentation at ONE component and moves completeness one layer down.

```
config.json ─(provider + href + secret)→ business/model/config.ts   collectStatsTargets
            ─(DASHBOARD_SECRET_<NAME>)→ [...slug]/+page.server.ts   the credential, resolved
            ─(TTL cache + one AbortSignal)→ business/model/stats.ts  readStats
            ─(fetch + wire schema)→ data/repository/<vendor>.ts
            ─(project)→ Stat[] ─→ StatsStore ─→ box-stats.svelte

every 60s:  POST /api/stats ─(allowlist from ALL pages)→ readStatsFor (the same fold)
            ─→ JSON, no credential in it ─→ overlay over `data` in [+page.svelte](src/routes/[...slug]/+page.svelte)
```

Both routes print their folds' log lines; the load owns first paint and the endpoint owns every
tick after it — see "Already done" for why the refresh stopped invalidating the load.

Fifteen ship: `adguard`, `pihole-v5`, `pihole-v6`, `uptime-kuma`, `proxmox`, `open-meteo`,
`jellyfin`, `sonarr`, `radarr`, `prowlarr`, `immich`, `paperless`, `gitea`, `forgejo` and
`glances` — the last eight being #33's cheap half, landed 2026-08-25. Two of them share a
repository file on purpose: [arr.ts](src/lib/data/repository/arr.ts) is one wire envelope
(`{ totalRecords }`) behind three tokens whose only differences are the API version in the
path (Prowlarr is v1 where Sonarr and Radarr are v3) and the product name in the error —
three copies of the same schema would be the duplication "One definition per concept"
exists for; the same holds for Gitea/Forgejo in
[forge.ts](src/lib/data/repository/forge.ts), which reads its unread count off
`X-Total-Count` rather than off the paginated body. Adding another is
**six** edit
points, not the five this list used to name: a repository file, one entry in `providers`, one
token in `providerNames`, one product name in `providerNameLabel`, and — per reading it adds
that nothing else emits — a `StatKey` with its `stat_*` message in BOTH catalogues, **plus an
entry in [box-stats.svelte](src/lib/presentation/components/box-stats.svelte)'s `chrome`** (and
one in its `formats`, if the reading is a number). Those two records are `Record<StatKey, …>`
and `Record<NumericStatKey, …>`, so a new key is a compile error in a file the list omitted —
discovered, but discovered late. Eleven things about the shape are decisions:

- **The registry lives in `business/model/stats.ts`, NOT in `data/repository/` where
  [roadmap.md](roadmap.md) #33 put it.** `Stat`/`StatKey` is a presentation-facing
  vocabulary — its keys index a message map — and `data → leaf only` means a repository
  may not import `business/type/stats.ts`. A registry down there would either move the
  projection out of business or hand `data` a type it cannot name. `Record<ProviderName,
ReadProvider>` gives the identical compile-time completeness either way, so the layer
  rule decides it. `providerNames` itself stays in
  [config.ts](src/lib/business/model/config.ts), because that file is in the CLIENT bundle
  (`poll-services-state.ts` value-imports `collectServiceProbes`) while `stats.ts`
  value-imports every repository; `stats.ts` type-imports the token and never the reverse.
- **A repository declares its wire shape as a valibot schema, and the projection reads
  `v.InferOutput` of it.** `readStats` is `fetch → project`, in that order, with the
  projection only ever running on the `[null, data]` branch — so it cannot read a field
  nothing validated. That is #17's bug made structural: a 200 carrying a shape nobody
  checked is `[AppError, null]` before a projection is reachable, instead of a TypeError
  that 500s the whole page and loses the instances that DID answer.
- **The 3s bound is minted by business and handed DOWN as a signal.** It is a page-latency
  policy — the same thing the 30s TTL beside it is — not a wire fact, and a provider that
  needs two round trips would otherwise spend a per-fetch bound twice, quietly doubling the
  worst case the whole design rests on. `stats.spec.ts` asserts the value; the repository
  spec asserts only that the signal it was handed is the one used.
- **A config entry names the VARIABLE holding its credential, never the credential.**
  `"secret": "ADGUARD_MAIN"` is read from `DASHBOARD_SECRET_ADGUARD_MAIN` through
  `$env/dynamic/private`, in the ROUTE, and passed to the model as a parameter (R1 — the
  model imports nothing to get it). The value is appended **verbatim**: folding case or
  punctuation would invent collisions whose failure mode is the wrong credential, silently,
  while verbatim lets the diagnostic name the literal key it looked up. Punctuation is the
  one case that cannot work at all — a shell cannot export `DASHBOARD_SECRET_A-B` — so the
  schema is `v.regex(/^[A-Za-z0-9_]+$/)` and the editor refuses the save instead.
  One string per instance, opaque; what it MEANS is the provider's own business (AdGuard
  splits it at the first colon). There is deliberately **no `requiresSecret` flag** on the
  registry: a 401 already says it, and a table would be a second declaration of each
  provider's auth that nothing forces to agree with the code that authenticates.
- **A named variable that is unset is an ABSENCE — skipped, logged once, never toasted.**
  Same rule the global credential pair had: an operator's own setup decision must not be put
  in front of every visitor on every page load. A box naming NO variable is read anonymously,
  which is right for a provider that needs none; one that does answers 401, and that is an
  ordinary failure that toasts.
- **The key is `provider` AND `href`, through `statsKey`.** The TTL cache, the page's record
  and the store all address a reading by that one string, so they cannot disagree. An href
  alone is not an identity: two boxes at one href with different providers is a real config
  — a Pi-hole migrated from v5 to v6 answers both — and an href-keyed cache would serve one
  provider's readings to the other. Not a collision: wrong numbers.
- **The failure seam is a LIST of instances, not a flag and not a provider list.** #17 keyed
  readings by instance, so a provider is not an identity either: with two Pi-holes and one
  down, "Pi-hole is unavailable" is true, useless, and indistinguishable from both being
  down. `StatsFailure` carries `{ key, provider, href }` and the route picks every word —
  `providerNameLabel` in [presentation/util/](src/lib/presentation/util/provider-name.ts)
  turns the token into a product name, which is **not** a paraglide message because a product
  name is identical in every locale and offering a translator four strings they must not
  touch is worse than a map. N failing instances raise N toasts, uncapped and deliberately: a
  summary line is the same "useless for eight" failure one level up.
- **A `StatKey` carries its unit, and the two share-shaped ones are FRACTIONS.**
  `blocked-share` and `uptime-24h` are 0..1, because `Intl`'s percent style is what formats
  them and multiplies by 100 itself. Both Pi-hole wires report 0–100, so both projections
  divide — the same rule `avg-latency` follows when AdGuard reports seconds. A wire value
  passed through unchanged is the silent version of this bug: `4.5` renders as `450%`.
- **Pi-hole is TWO provider tokens, not one with a version prop.** v5 (`/admin/api.php`,
  token in the query) and v6 (a session against FTL) share no path, no auth and no field
  name, so one token would be a branch wrapping two unrelated bodies — and the operator has
  to know which they run anyway, because the two take different secrets. Auto-detection was
  refused: a round trip per cache miss against a host that may be down, for a fact the
  operator already has. `statsKey` carrying the provider is what lets one href answer both
  during a migration.
- **v6 caches its session id at module scope in the repository, and BOTH round trips spend
  one signal.** FTL caps `webserver.api.max_sessions` at 16 and answers 429 once they are
  gone, so a login per read would take the operator's own admin UI down with the dashboard.
  What invalidates an entry is named rather than hoped for — a 401 from the summary call,
  which is what the 30-minute timeout produces — and the re-auth happens **once per read and
  only for a session that had already served a summary**. That `proven` flag is not caution:
  a 401 is evidence of expiry only for a session that worked, while a proxy stripping
  `X-FTL-SID`, TOTP on the instance or an app password without the scope refuses a session
  minted seconds earlier and never stops — so re-authing on every 401 spent a seat per read
  and burned all 16 in eight minutes at the 30s stats window, which is the exact 429 the
  cache exists to prevent. The trade is honest: while such a 401 persists the cached session
  is reused and the read keeps failing, so an instance whose session FTL has since dropped
  needs a restart to log in again. **A box naming no secret never logs in at all** — an
  instance with no password set answers the summary unauthenticated, and its `/api/auth`
  returns a 200 whose `sid` is null, which is byte-identical to a refusal. The handshake is
  also why the 3s bound is minted in `stats.ts` and handed down: a per-fetch bound here
  would have been spent twice, quietly doubling the worst case the page rests on.
- **`redirect: 'manual'` on both Pi-hole fetches, and the reason is not symmetry.** v5's
  token is in the query string and v6's session id is a custom header, and a redirect strips
  neither — so a followed one hands the credential to a host the operator never configured.
  AdGuard's credential is `Authorization`, which the Fetch spec deletes across origins by
  itself (measured on node 22.14: a cross-origin redirect target received `{"seenAuth":null}`
  where a same-origin one got the header), so it has nothing left to leak and follows; Uptime
  Kuma reads a public status page and has nothing to leak either. **An earlier version of this
  bullet said following redirects is "what keeps an instance behind an `http:`→`https:` hop
  working". It is not** — `http:`→`https:` is cross-origin, so the credential is dropped and
  AdGuard answers 401. An href has to name the address the instance actually answers on, and
  README.md says so where an operator will read it.

### The feed box

The seventh container renders a LIST — titles linking out — which is the one shape no other box
has, and roadmap #48's reason for existing. The plumbing is the stats seam run one more time,
so what belongs here are only the differences:

```
config.json ─(href)→ business/model/config.ts   collectFeedTargets (bare hrefs, deduped)
            ─(5-min TTL cache + one AbortSignal)→ business/model/feed.ts   readFeed
            ─(fetch verbatim + XML parse + valibot PER ENTRY)→ data/repository/feed.ts
            ─(project: cap 50)→ FeedItem[] ─→ FeedStore ─→ box-feed-wrapper ─→ box-feed.svelte
```

- **The cache key and store key are the bare href** — there is no provider token to fold in, so
  `statsKey` has no analogue and two boxes naming one feed share one fetch legitimately; each
  box's `limit` slices at render time.
- **Validation degrades PER ENTRY, not per read.** A real feed carries the occasional ad or
  empty stub, so entries failing `safeParse` are dropped and only a feed yielding ZERO readable
  entries fails the box. Deliberately unlike the stats wires, where one unexpected shape errors
  the whole instance: there a partial body means every field is suspect; here each surviving row
  validated itself.
- **fast-xml-parser's leniency is part of the contract.** It tolerates truncation — which then
  lands in "without a single readable entry", the honest answer for an HTML page served with a
  200 — and throws only on things like malformed attributes ("did not parse as XML"). Both paths
  asserted. Entities inside CDATA stay literal, which is the XML spec and not a parser bug, and
  `parseTagValue` is off so `<title>2026</title>` stays a string instead of failing validation
  for being what it honestly said.
- **No credential, so redirects FOLLOW**, unlike both Pi-holes: a public feed has nothing for a
  redirect to leak, and `http:` → `https:` hops are ordinary for feeds.
- **The box takes no `href`.** Its siblings each render the configured instance as ONE link,
  while this one renders N links out of the items — so the URL lives on the WRAPPER, where it is
  the store's lookup key, and the box stays a pure list that a story can mount without any
  store at all. `limit` is clamped at the box (`max(1, floor())`): a hand-edited 0 must read as
  one row, not as a broken feed.
- **Feeds join both client-side gates**: the refresh interval counts them in `refreshable`, so a
  feed-only install still refreshes, and `failedFeeds` rides the route's `reportedFailures` list
  beside the stats keys — the two never collide, because a stats key always carries its provider
  prefix.

### The appearance pipeline

The subtlest machinery in the app. All three preferences are cookie-backed **so the server
can get the first paint right**, but they arrive by two different routes: theme and
scenery-motion are stamped as HTML **classes**, while the seed travels as layout data and
ends up in a **`style` attribute**. Grepping [app.html](src/app.html) for a seed placeholder
finds nothing.

```
cookies + the request URL
        ─→ data/repository/appearance-repository.ts   the 3 cookie names, parsing, and ALL writes
        ─→ business/model/appearance.ts               every decision: does this theme still exist?
                                                      mint a seed? may its cookie carry `Secure`?
        ─→ hooks.server.ts        replaces %theme% / %scenery-paused% + the two
                                  %theme.default*% in app.html                    (classes)
        ─→ +layout.server.ts      hands the mint `event.url`; passes theme / seed / paused as
                                  INIT SEEDS
        ─→ ThemeStore             owns it from here; mirrors every change back to the cookie
        ─→ +layout.svelte         seed → sceneryStyle() → style attribute on .theme-scenery
```

The repository/business split is the one to respect: the repository does parsing and cookie
I/O and **decides nothing**; business makes every decision and owns no cookie names. A new
appearance cookie's name and write belong in the repository, its rules in business.

- The store reconciles **two** sources: the SSR payload and `matchMedia`. It read
  `document.cookie` as a third until [roadmap.md](roadmap.md) #9, and **do not put that back.**
  The same request had already resolved the same three cookies through the same
  `resolveThemeName` to produce the payload, so the client read could only ever agree with what
  it was handed — while its early `return` made the blocks under it look conditional when they
  were not. What went with it: `readClientAppearance` in `business/model/appearance.ts` and
  `documentCookies` in [cookie.ts](src/lib/data/storage/cookie.ts), so `CookieSource` is now
  server-only, over `event.cookies` alone, and the data layer has no cookie READ in the browser
  left. It is not free of browser reads: `writeCookie` reads `location.protocol` to decide
  `secure` — see the two-sources carve-out below. The cookie WRITES are untouched — the store
  still mirrors every change back through business, which is the direction the diagram above
  shows. The trade is named: a theme switched in another tab
  while this one is loading no longer snaps in on hydration, and that is the better paint, because
  `hooks.server.ts` had already stamped the old theme's classes pre-paint.
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
- **`secure` is STATED on all three cookies rather than left to SvelteKit's default.** The
  browser half derives it from `location.protocol` inside `writeCookie`; the server half is
  decided by `readOrMintScenerySeed`, which takes the request URL the route hands it (R1 — the
  model imports nothing to get it) and passes a boolean down to `$createScenerySeedCookie`.
  Kit's own default is `secure` unless the hostname is `localhost` over http, and that is wrong
  in both directions once deployed. Measured against `node build` on plain http: the mint
  shipped `set-cookie: scenerySeed=3894586632; Max-Age=31536000; Path=/; Secure; SameSite=Lax`,
  and three cookie-less GETs to one process came back with three distinct seeds (4259248967,
  2267366104, 3601781080) — a dropped cookie is re-minted on every response, so the scenery
  re-arranges on every navigation and the document is permanently unshareable.
- **The browser DROP is not universal, which is the sharper reason this was invisible.**
  `http://localhost` and `http://127.0.0.1` are potentially-trustworthy origins and ACCEPT a
  `Secure` cookie — measured: curl stored one served from `127.0.0.1` and sent it back over
  plain http — so the failure belongs to LAN-address deployments alone
  (`http://192.168.x.x:3000`). `npm run dev`, `vite preview` and CI all talk to loopback, so
  none of the three can reach it.
- **The server half is only honest when adapter-node is told the real protocol, and no code
  change compensates.** `get_origin`
  (`node_modules/@sveltejs/adapter-node/files/handler.js:208-210`) defaults the protocol to
  `https` when `PROTOCOL_HEADER` is unset and never consults the socket, so `event.url.protocol`
  reads `https:` on a plain-http server and an operator who sets neither that nor `ORIGIN` still
  gets `Secure`; with `ORIGIN=http://127.0.0.1:PORT` the attribute is absent, measured. Guessing
  the other way is not on offer, because the failure is asymmetric: `secure: true` where it is
  wrong BREAKS the cookie, while `secure: false` where it is wrong costs one hardening flag on a
  public random integer that already ships in the SSR payload. And `ORIGIN` is required for the
  admin area regardless — measured, `POST /admin/login` over plain http without it answers 403
  (kit's `Cross-site POST form submissions are forbidden`, comparing the request origin to
  `url.origin`) and 200 with it, a requirement that PREDATES this. So the fix is the operator
  doc, in README.md beside the TLS note, which is the same shape as the gap at the end of "The
  admin area" — and `ORIGIN` does not close that one: the successful login response still
  carries `Secure` on `adminSession`.
- **The `secure` decision has TWO sources, and that is a carve-out rather than drift** — two
  reviewers read it as drift, so it is written down. Business decides it for the server-minted
  seed, because a request exists there to read it off; `data/storage/cookie.ts` decides it for
  the three browser-written cookies by reading `location` itself. Threading a boolean out of
  `ThemeStore` and through business was considered and REFUSED: on the client there is no
  request to thread, `location` IS the scheme, and reading it in the write path is I/O — which
  is what this layer is for — rather than a judgment, so the alternative is three widened
  signatures whose only job is to let a store tell the browser what scheme the browser is on.
  `location` is read INSIDE `writeCookie` and never at module scope, because the module sits on
  the SSR import path (`appearance-repository` → `business/model/appearance` →
  `hooks.server.ts`), where there is no `location` to read.
- `business/model/theme.ts` is deliberately free of runes and of storage, so the SSR path can
  import it without pulling in the client-reactive store.

### The admin area

One operator, one shared secret, no user system. It exists because `config.json` is the
internal network map _and_ the source of `/api/ping`'s allowlist: an unauthenticated write
path would let anyone on the LAN rewrite that allowlist and turn the ping endpoint into an
arbitrary internal port scanner. So auth landed **before** any write path, and the editor landed
behind it: `/admin` now generates a form from the container schema and writes `config.json`
through `writeConfig` — see "Config-driven rendering" for both halves.

```
DASHBOARD_ADMIN_TOKEN ─→ business/model/admin-auth.ts    every decision, owns no cookie name
                      ─→ data/repository/admin-session-repository.ts   the cookie name + attributes
                      ─→ hooks.server.ts   handleAdmin, third in the sequence
```

The same repository/business split the appearance pipeline uses, for the same reason. Five
things about it are decisions:

- **Unset token ⇒ the whole area 404s**, not 401, and with the same sentence the catch-all
  404 uses. A feature that is switched off must not advertise that it exists. A hook-thrown
  404 renders SvelteKit's static fallback rather than [+error.svelte](src/routes/+error.svelte),
  so the chrome still differs from a config 404 — closing that would mean moving the guard
  outside `handle`, which nothing can do: routes resolve before hooks, and `reroute` is
  universal so it cannot read private env.
- **`/admin` is reserved, and the guard wins over config.** A `pages` key of `/admin` still
  renders in the navigation but stops being reachable the moment the token is set. A reserved
  path a config file could take back is not reserved. It is a README note rather than a runtime
  warning because `business/model/config.ts` is browser-safe and cannot read the env, so
  detecting the collision would mean threading the enabled flag through normalization for one
  diagnostic. The prefix is the **segment** — `/admin` or `/admin/…` — so `/administration` is
  an ordinary config page.
- **The comparison is constant-time over SHA-256 digests**, not over the raw strings.
  `timingSafeEqual` throws on a length mismatch, so comparing 32-byte digests means a
  wrong-length guess takes the same path as a wrong-value one instead of returning early.
- **The cookie holds the token itself**, `httpOnly` + `SameSite=Strict` + `secure` outside dev.
  A derived digest would be exactly as replayable, so it buys nothing; what limits exposure is
  the attributes. Rotating `DASHBOARD_ADMIN_TOKEN` therefore signs everyone out, and that is the
  whole revocation mechanism — no session store, no session ids, no expiry sweep. Deliberately
  **not** `cookieWriteOptions`: the appearance cookies are read by the browser and ride along
  on cross-site navigations, and this one must do neither.
- **The route files do not re-check auth.** `handleAdmin` has already answered for every
  `/admin` path, and a second check is a second place to get it wrong.
- **The header's link to the area is gated on the same flag as the guard**, via
  `adminEnabled: isAdminEnabled()` from [+layout.server.ts](src/routes/+layout.server.ts) — an
  unconditional link would both advertise a switched-off feature and 404 when followed, which
  is decision one above. There is deliberately **no "is signed in" flag and no second label**:
  `handleAdmin` redirects an unauthenticated `/admin` to the login form, so one link naming the
  destination is right in both states and a second flag would be machinery for a distinction
  the redirect already owns. The link sits with the appearance menus rather than in the
  config-pages nav rail, because that rail is driven by config's own keys and `/admin` is a
  path the guard takes back. Accept the corollary: once the token is set, the link tells
  anyone who can load the dashboard that an admin area exists — and so does `adminEnabled` in
  the SSR payload, whether or not the link renders. That is the price of a UI entry point, and
  it is why the gate is the token rather than always-on.

- **A second entry point sits beside that link: a pen to `/admin#<page path>`, and it needed no
  code on either side of the fragment.** The editor's per-page `<h4>` carries the config key as
  its `id`, and kit's client router already resolves a fragment with
  `getElementById(decodeURIComponent(hash))`, scrolls it into view, then moves the **sequential
  focus navigation starting point** to it through a `location.replace`
  (`node_modules/@sveltejs/kit/src/runtime/client/client.js:2007-2028` and `reset_focus`). So an
  `$effect` calling `focus()` was written and then deleted — it would have duplicated the scroll
  and been strictly worse, because focusing a heading STEALS focus where kit only moves where Tab
  continues from. Three things about it:
  1. **The id is the config key verbatim, slashes included** — `/media/plex`. That is a legal
     HTML id and `getElementById` matches it exactly; only a `querySelector('#…')` would choke on
     it, and neither kit nor the browser uses one. Don't slugify the key — the header has nothing
     but the key to build the href from, so both sides would have to agree on the transform.
  2. **`scroll-mt-section-lg` on that heading is load-bearing, not padding.** The header is
     `sticky top-0`, so a scroll landing the heading at viewport top puts it under the header.
     Nothing fails; the operator just arrives at a block whose title is covered.
  3. **The pen renders only where `configPage` is defined**, which excludes `/admin` itself and
     the configured 404 — neither is a `pages` key, so there is no block to land on. Same
     `adminEnabled` gate as the link, and no "is signed in" flag for the same reason: signed
     out, `handleAdmin` redirects it to the login form. Measured: a direct hit keeps the
     destination through signing in with no code on either side — the browser re-attaches the
     fragment to each redirect that lacks one (the 303 to the login form, then the action's 303
     back to `/admin`), so `/admin#/media/plex` → sign-in → `/admin#/media/plex`, and kit
     resolves it after authentication. The signed-out **click** loses it instead — kit follows
     the redirect client-side and nothing re-attaches — which is that acceptance stated
     precisely; carrying the intent would need exactly the sessionStorage queue this repo has
     refused twice. The direct-hit path is fenced by
     [can-reach-the-admin-area.e2e.ts](e2e/can-reach-the-admin-area.e2e.ts).

- **The login backoff is process state in `business/model`, and the client address is a
  parameter.** Five failures per address, then `min(5s × 2^(n − 6), 60s)`, cleared by a success
  and pruned on write so the Map cannot grow without bound. **The prune is also the decay**: an
  address that waits out the longest lockout loses its entry and starts from zero, so the sustained
  ceiling is five guesses a minute per address rather than five ever — which is intended, because a
  permanent memory of failures locks an operator out of their own dashboard forever. Four things
  about it are decisions:
  1. **It lives at module scope in `admin-auth.ts`**, on the same precedent as
     `config-source.ts`'s stamp cache — a store is unreachable from the SSR path, and a `data/`
     module would be a second file for one caller with no external name to own. The consequence
     is honest and in README.md: the counter is per process, so a restart forgets it, and a
     second instance behind a load balancer has its own.
  2. **`clientAddress` is passed in** (R1) — the model imports nothing to get it, the route
     hands it `getClientAddress()`.
  3. **A locked address is refused even with the right token**, because the winning guess is the
     only one that matters. And the cap is **60 seconds, not an hour**: behind a proxy that does
     not forward the client address every request shares one bucket, so the backoff goes global
     — a long cap would let a stranger's guessing lock the operator out of their own dashboard.
     The limit is the second line of defence; the token's length is the first.
  4. **`isAdminAuthenticated` does not touch the counter.** The cookie check runs on every admin
     request, so counting it would fire on ordinary navigation and hand a spoofed address a
     lockout of the real operator.

  It returns a **kind plus a number** — `{ status: 'locked'; retryAfterSeconds }` — and the login
  page picks every word, the same seam as `failedStats`. **There is deliberately no e2e for
  it:** one preview server process serves the whole playwright run and every admin spec signs in
  from `127.0.0.1`, so a lockout test would poison whichever admin spec ran next. The node spec
  keys each case on its own fake address instead, which is also why no test-only reset export
  exists. The live constraint that replaces the missing e2e is the free-attempt budget: the
  suite's one deliberate wrong token, times CI's two retries, is 3 of the 5 — a second
  wrong-token test has to check that sum, and there is a comment where it would be added.

One gap is left, known and not accidental: `secure: !dev` means a production deployment on plain
http will have the browser drop the cookie so the login never sticks — serve it over TLS. It is
in README.md. Two measured refinements, both from #15: the drop is a LAN-ADDRESS one, because
`http://localhost` and `http://127.0.0.1` accept a `Secure` cookie — see the `secure` bullets in
the appearance pipeline — and on plain http the login POST never gets that far without `ORIGIN`
anyway, because kit answers 403 `Cross-site POST form submissions are forbidden`, comparing the
request origin against a `url.origin` adapter-node guessed as `https`. `ORIGIN` closes that 403
and nothing else: the successful response still carries `Secure` on `adminSession`.

### The response headers and the CSP

One `Handle` sets four headers, `svelte.config.js` declares the policy, and `app.html` carries a
nonce. It is small; three things about it are decisions, and one is a trap that looks like
hardening.

```
handleSecurityHeaders ─→ FIRST in sequence(), so it wraps the other four handles
                      ─→ Referrer-Policy, X-Content-Type-Options, X-Robots-Tag on everything
                      ─→ Cache-Control: private, no-store on text/html ALONE
kit.csp.directives    ─→ mode 'auto' — nothing prerenders, so it resolves to nonces
src/app.html          ─→ <script nonce="%sveltekit.nonce%"> on the pre-paint script
```

- **`Referrer-Policy` is `same-origin`, and `no-referrer` is the version that breaks the admin
  area.** This is the one to read before "strengthening" it. Appending a request's `Origin` header
  is referrer-policy-dependent for a non-CORS request that is not a `GET` (fetch spec, "append a
  request `Origin` header"): under `no-referrer` the origin is serialized as `null`
  **unconditionally**, under `same-origin` only when the request really is cross-origin. A form
  POST is a navigation, so `no-referrer` sends `Origin: null`, kit compares it against `url.origin`
  and answers 403 `Cross-site POST form submissions are forbidden` — every sign-in and every config
  save. Measured with curl: 403 with `Origin: null`, 200 with the real origin. Cross-origin leakage
  is identical under both values, which is the whole reason the weaker-sounding one is correct:
  the icon CDNs get no `Referer` either way. The fence is the four admin cases in
  [can-sign-in-as-admin.e2e.ts](e2e/can-sign-in-as-admin.e2e.ts) and
  [can-edit-the-config.e2e.ts](e2e/can-edit-the-config.e2e.ts) — **and they only fence it because
  the suite runs against `node build`**, which is the only runtime carrying kit's origin check.
  Under `vite preview` this shipped green. A header change and the e2e harness are one review.
- **`Cache-Control` is gated on `text/html`, and the gate is the point.** `GET /` returns German or
  English purely on the `PARAGLIDE_LOCALE` cookie, plus a cookie-derived theme class and
  scenery-paused class, with no `Vary` on it — so a shared cache is the failure. Unconditional, the
  same header would throw away the year-long `max-age` on the hashed assets under
  `/_app/immutable/`, and kit already sets `private, no-store` on `__data.json` itself.
- **Three directives are deliberately wide, and no build-time list can narrow them.** `img-src` and
  `form-action` allow `http:` and `https:` wholesale because icon hosts and the `BoxSearch` engine
  come out of `config.json`, which is **read from disk at runtime** — the same fact the Tailwind
  invariant rests on. `style-src-attr: 'unsafe-inline'` is required because computed values ride in
  style ATTRIBUTES (`--span`, the scenery vars, the generated theme swatches) and kit's own nonced
  `<style>` nullifies `'unsafe-inline'` in `style-src`. `script-src` is spelled out rather than left
  to `default-src` so kit has an explicit directive to hang the nonce on.
- **The handle is first, so `handleAdmin`'s thrown 404 and its 303 carry none of these headers** —
  they are produced above it. Known, accepted, and not worth a second mechanism for one 404.
- **The nonce is fenced, textually.** [invariants.spec.ts](src/lib/test/invariants.spec.ts) asserts
  both halves: `app.html` carries `nonce="%sveltekit.nonce%"` on its pre-paint script, and
  `script-src` is spelled out in [svelte.config.js](svelte.config.js) for kit to hang it on. Drop
  either and CSP blocks the pre-paint script — a first visit on a dark-preferring OS gets a light
  flash, with no error anywhere. A runtime check cannot serve instead: `npm run dev` nonces vite's
  injected scripts too, so dev is green whatever `app.html` says.

## Invariants

Things that break **silently** — no error, just wrong output.

- **Config carries tokens, never class names.** Tailwind compiles by scanning source at
  build time, so a class that only ever appears in runtime config produces no CSS and does
  nothing at all. Column width goes through `span` (1–12) → a `--span` custom property →
  the static `xl:col-span-(--span)` utility. Anything new that must be configurable follows
  the same shape: a named token in config, mapped to literal classes in the component.
  `normalizeConfig` strips `class` / `gridClass` from config and warns — and since #22 it
  strips and warns about EVERY key the container's schema does not declare, so a stray
  `title` or `data-*` can no longer ride the spread onto a real DOM node.
- `spanStyle()` must always emit `--span`. An unset custom property makes `grid-column`
  invalid at computed-value time, which drops the whole declaration.
- **A `@container/name` element is a query container for its DESCENDANTS, never for itself.**
  `@2xl/box-date:flex-row` on the same element that declares `@container/box-date` matches at
  no width, with no error — the class is emitted, the rule is generated, and it is simply never
  in scope. Measured: the box computed `flex-direction: column` at a container width of 1376px.
  So the queried classes go on a child, which is why
  [box-date.svelte](src/lib/presentation/components/box-date.svelte) has a wrapper around its
  two lines that exists for nothing else.
- **Two `@theme` scales in [tokens.css](src/lib/presentation/style/tokens.css) are hand-mirrored**
  in `extendTailwindMerge` in [style.ts](src/lib/utils/style.ts): `spacing`, and `shadow: ['card']`
  for the one `--shadow-*` key. Either drifting has the same silent failure — `cn()` stops
  recognising the class as a conflict and keeps both. Measured on the second: unlisted,
  tailwind-merge reads `shadow-card` as a shadow COLOR, so `cn('shadow-card', 'shadow-none')` kept
  the pair and sub-grid's switch-off held only by CSS emission order.
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
  and are kept diffable against it so upstream theme work stays copy-pasteable — 16 of the 17
  shared `scenery/*.css` files are currently byte-identical to zenith's, `index.css` being the
  one exception because its `@import` list is per-project. The directory holds **18**: `revie.css`
  is this app's own scenery and has no zenith counterpart, so it is not one of the shared files.
  `zenith`'s shadcn / tw-animate / fontsource imports are intentionally dropped here, as are the
  10 scenery files belonging to themes this project doesn't carry.
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
  (it only ever sits in the blurred header). Five of the six containers a config can name keep
  theirs, because config decides whether they are nested and no component can know. `SubGrid` is
  the exception and not a counter-example: it can still be top-level, but it draws no surface at
  all, so `backdrop-blur-none` is there because there is nothing of its own to blur.
- **A box does not name its own fill — the container it sits in declares it, through
  `--box-surface`.** Config decides depth, so no component can know its own: the same
  `BoxService` is a tile inside a `Grid` card on one page and sits straight on the page on
  another, and one hardcoded fill is wrong in whichever case it wasn't written for. It was
  wrong: every box named `bg-surface-inset`, so a top-level `BoxDate` / `BoxStats` rendered
  a step **below** the `Grid` card beside it, which is elevation upside down for two siblings.
  Measured on `solid-light` — inset `0.955` on a `0.96` page, so the clock box dissolved into
  the background while the card next to it was white with a shadow. The shape now:

  | Who                                                                                                                                     | Does what                                         |
  | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
  | `box-date`, `box-stats`, `box-search`, `box-service`, `grid`, `config-container`'s `{:else}`, [+error.svelte](src/routes/+error.svelte) | READ it: `bg-(--box-surface,var(--surface-card))` |
  | `grid`'s items `<div>`, `box-stats`'s `<dl>`                                                                                            | DECLARE `[--box-surface:var(--surface-inset)]`    |
  | `sub-grid`'s items `<div>`                                                                                                              | PASS THROUGH: `[--box-surface:inherit]`           |

  Four things about it are load-bearing:
  1. **The declaration is on the items wrapper, never on the card that reads it.** Unlike a
     container query, a custom property DOES apply to the element that declares it — so a card
     that both declared and read `--box-surface` would hand itself its own children's fill.
  2. **`SubGrid` inherits rather than stepping down**, because it draws no surface: its tiles
     sit on whatever the group sits on. Nested, `inherit` reaches the outer card's `inset`;
     top-level there is nothing to inherit, the property is guaranteed-invalid, and the `var()`
     fallback takes over — which is exactly right in both. Step down there instead and a
     top-level group's tiles drop below a page they are sitting directly on.
  3. **The default lives in the `var()` fallback, not at `:root`.** base.css and tokens.css are
     kept diffable against zenith (see below), and a story mounts a box with no page above it —
     the fallback is the one form that costs neither.
  4. **It names the seed `--surface-card`, not the `--color-surface-card` utility.** `@theme
inline` inlines its values at build time and emits no `--color-*` custom property, so the
     seed is the only name that exists at runtime. This is the one place a component reaches
     past a utility class to a seed, and there is no alternative.
  5. **`box-service`'s icon plate names `bg-surface-inset` directly**, and that is not a hole in
     the rule: `--box-surface` carries the TILE's own fill, so a plate reading it would be handed
     the surface it is meant to sit on. It hardcoded `bg-surface-card` before, which is exactly the
     tile's fill whenever the tile is top-level — so the plate vanished into it.

  Two steps is all there is, because there are only two tokens: page → card → inset. The third
  level — a reading inside a nested `BoxStats` — lands on inset-over-inset and reads only
  because the veil composites (next bullet).

- **On the dark glass themes, nesting gets LIGHTER — `--surface-inset` is a white veil.** All
  15 of them pair `--surface-card: oklch(1 0 0 / ~0.06)` with `--surface-inset:
oklch(1 0 0 / 0.05)`, so the ladder that renders is card → inset and brightens with depth. It
  was a **black** veil at `0.15`–`0.35` until 2026-08-04, which inverted the elevation: the box
  read as a hole punched through the card above it. The light themes are the other way round on
  purpose — deeper is slightly darker there (`oklch(0 0 0 / 0.05)`, or a hued veil at
  `0.07`–`0.1`) — so this flip applies to dark themes only. `.dark` in
  [base.css](src/lib/presentation/style/base.css) is opaque and already brightens with depth.
- **A translucent veil COMPOSITES, so `--surface-inset` is `0.05` and not `0.1`.** It was `0.1`
  until 2026-08-05. Landing on a card's ~0.06 it reached `1 − 0.94 × 0.9 ≈ 0.154` — two and a
  half times the surface it sat on, which is why a `BoxService` tile read as a bright grey patch
  and, on the tinted dark themes (royal, aurora, synthwave, abyss), washed the palette out of
  itself: the veil is **neutral white**, so the more of it there is, the less theme is left. At
  `0.05` the composite is `≈ 0.107`, one quiet step above its card. Halving it is safe in the
  other direction because nothing depends on inset being far from card; a step is all that is
  needed. Same defect mirrored on `solid-light`, whose opaque `--surface-inset` was
  `oklch(0.91 …)` against a `0.995` card — a drop so deep it fell **past the page** (`0.96`) and
  read as a hole; it is `0.955` now, a step of `0.04` that matches what a `0 0 0 / 0.05` veil
  does on the light glass themes.
- **`<main>` is the CONTENT GRID, not the page — the page is `.page-shell`, and a theme that wants
  to paint the page has to say so.** `<header>` has to be a sibling of `<main>` to map to `banner`
  rather than `generic`, so the page-spanning element is a plain wrapper div carrying the padding
  ramp, `min-h-screen` and — load-bearing — the tall ancestor the sticky header needs, since a
  sticky element can only travel inside its parent's box. `.page-shell` is a hook for
  [themes.css](src/lib/presentation/style/themes.css), not a utility, and it is the one element
  selector in the whole style directory. It exists because `glass-dark` nests
  `main { background-color: rgba(0,0,0,0.2) }` — a scrim that "tames the texture", and that spanned
  the page only for as long as `<main>` did. Measured at 1280×720 while it still said `main`: the
  scrim computed over a 1216×494 box instead of the full 1280×720, so the sticky header, the page
  margins and everything below the last card lost their 20% black and the header's `backdrop-blur`
  sampled the undarkened photograph. Nothing failed; it just looked wrong on one theme in 27. A new
  theme wanting a page-wide wash targets `.page-shell`, and a paste from zenith that says `main`
  has to be changed on the way in, the way `fallow` gets dropped.
- **A heading level is depth, so the container declares it — the same shape as `--box-surface`.**
  `headingLevel?: 2 | 3` on `box-service` and `grid`, threaded through `config-container`; `grid`
  hands its items `3` when it drew a heading of its own and `2` when it did not, on the same
  condition as the heading block so the two cannot disagree. The layout's app title is the page's
  only `h1`, so a `BoxService` sitting straight on the page was an `h3` under an `h1` — a skipped
  level on two of the routes the e2e fixture exercises — while the same tile inside a `Grid` card
  correctly sat under that card's `h2`. Same for a top-level `SubGrid`'s label, which is its only
  heading. Size stays a class, so nothing moves visually. The storybook a11y gate cannot catch this
  class of defect at all: no story mounts the layout, so axe never sees the `h1` being skipped from.
  [is-accessible.e2e.ts](e2e/is-accessible.e2e.ts) is what does — but only because its tag list
  carries `best-practice`, since `heading-order` is tagged that and nothing else.
- **A theme lives in three hand-edited places**, plus optionally a fourth:
  1. the `ThemeName` union **and** the `themes` catalogue in
     [theme.ts](src/lib/business/model/theme.ts) — 27 entries. Union → catalogue is the one
     direction that is machine-checked, by the type-only `UncataloguedThemeName`: verified, deleting
     an entry now reports `Type '"abyss"' does not satisfy the constraint 'never'` where it used to
     compile clean at 0 errors. What buys it is `themes = [...] satisfies ThemeItem[]`, not an
     annotation — `themes: ThemeItem[]` widens every `name` back to `ThemeName`, which is why the
     `as const` that used to sit there was inert. Places 2–4 are still hand-held.
  2. an `@custom-variant` in [tokens.css](src/lib/presentation/style/tokens.css)
  3. a palette class in [themes.css](src/lib/presentation/style/themes.css) — **except** the two baseline
     themes: `solid-light` and `solid-dark` (CSS class `dark`) live in
     [base.css](src/lib/presentation/style/base.css) instead
  4. optionally a [scenery](src/lib/presentation/style/scenery/) file

  Place 2 has its own carve-out: there are **26** `@custom-variant` rules for 27 themes, because
  `solid-light` is the unprefixed `:root` palette and needs no variant to select it.

  The header-dropdown swatch is **not** one of them — it's generated from `theme.css`
  ([+layout.svelte:191](src/routes/+layout.svelte#L191)), which is what keeps it matching the
  real palette. Don't hand-write a swatch.

- **[scenery-seed.ts](src/lib/presentation/util/scenery-seed.ts) gives each theme its own PRNG
  stream, keyed by the theme's name** — `themeRandom(seed, 'dunes')`, `mulberry32(seed ^ hashName(name))`
  — so draw order only has to hold _within_ one theme. Adding, reordering or retuning one theme
  cannot reshuffle another's arrangement, which is what two shared streams and a "must stay last"
  guard used to cost. The stream key is the **theme name**, so renaming a theme reshuffles that one
  theme for every existing user; the names in `themeRandom` calls are the 11 with a
  [scenery](src/lib/presentation/style/scenery/) file that reads seeded vars, and they must keep
  spelling real `ThemeName`s.
- Every read of a stored theme must go through `resolveThemeName()`. Cookies outlive deploys;
  a cookie naming a deleted theme resolves to no CSS classes and the app renders unstyled.
- Paraglide **regenerates `src/lib/paraglide/` on every vite run** and typechecks message
  _parameters_ — but a **missing translation fails nothing**. For a locale lacking a key the
  compiler emits `const de_<key> = en_<key>;` and succeeds, so a German page silently renders
  English. (Verified: delete a `de` key, recompile, and the compile is green.) Coverage is not
  checked anywhere. That directory is gitignored — never edit it. Add keys to **both**
  [messages/en.json](messages/en.json) (base) and [messages/de.json](messages/de.json); currently
  52 keys plus `$schema`, held in sync by
  [invariants.spec.ts](src/lib/test/invariants.spec.ts), the drift fence #29 landed.
  **Nine take parameters** — `service_probe_failed({ href })`, so the toast names the service it
  could not reach, `admin_container_add_at({ target, position })`, so each of a list's N+1
  insertion buttons has an accessible name that says which list and where,
  `admin_container_move_up` / `admin_container_move_down` with the same two parameters, for the
  same reason on the reorder buttons,
  `admin_sign_in_locked({ seconds })`, so a locked-out operator knows whether to wait or to go
  looking for the token, `admin_edit_page({ name })`, because the header's pen is icon-only and
  its accessible name is the whole of what says which page it opens the editor at, and the three
  `stats_*` keys, which all take `{ provider }` — a
  PRODUCT name out of [provider-name.ts](src/lib/presentation/util/provider-name.ts), never
  the config token — plus `{ host }` on `stats_open`, so two `BoxStats` instances on one page
  do not offer a screen reader two links with the same name, and `{ href }` on
  `stats_load_failed`, so a page of several says which one is empty. They are the only things
  the compiler's parameter typecheck has ever had to check. The nine `stat_*` keys are
  labels — one per `StatKey`, so a reading a provider emits and nobody has words for is a
  compile error — with `Intl.NumberFormat` formatting the
  readings themselves ([box-stats.svelte](src/lib/presentation/components/box-stats.svelte)).
  A parameter is how DATA reaches a message; it is never how copy leaves a lower layer — see the
  no-copy-crosses-a-layer rule above.
- **The locale is resolved `cookie → globalVariable → preferredLanguage → baseLocale`, and the
  first visit is the interesting one.** The first SSR response follows `Accept-Language`
  (`extractLocaleFromHeader`), and the client's first `getLocale()` then PERSISTS whatever it
  resolved to the `PARAGLIDE_LOCALE` cookie behind paraglide's own `localeInitiallySet` flag — so
  the browser preference is read once and pinned from then on, and the dropdown is thereafter
  overriding a cookie rather than a header. Two consequences, both left open on purpose and
  recorded in [roadmap.md](roadmap.md) #26: the SSR response now varies by `Accept-Language` with
  no `Vary` header on it, because paraglide only sets one on the redirect branch `url` would
  enable; and SSR resolves from the header while the client resolves from `navigator.languages`,
  so anything rewriting `Accept-Language` in between is a hydration text mismatch. **A test must
  never inherit the machine's language.** `test.use({ locale })` is what a Playwright spec needs —
  a default Chromium context sends no `accept-language` at all and reports
  `navigator.languages === ['en-US']`, so [playwright.config.ts](playwright.config.ts) pins
  `locale: 'en-US'` rather than relying on that. In a story the lever is `overwriteGetLocale` in
  `beforeEach` with its own teardown: `{ locale: 'de' }` on a message cannot reach a component
  that reads `getLocale()` at mount for its `Intl` formatters, and `setLocale()` would write the
  cookie into the shared browser page.

## Conventions

**Where a test belongs.** `*.spec.ts` runs in node, `*.svelte.spec.ts` in real Chromium, and
`*.stories.svelte` runs in a third project through `@storybook/addon-vitest` — three projects
in [vite.config.ts](vite.config.ts), not two. Components and anything touching the DOM go in
the browser project. Test files are not compiled as rune modules, so they cannot use `$state` /
`$effect` — a store whose constructor registers effects has to be built inside a component.

The `client` project's `exclude` is `src/lib/data/**` where zenith's is `src/lib/server/**`
(there is no `src/lib/server/` here). That line is a **deliberate divergence, not drift** —
copy zenith's over it and the three data-layer specs silently start running in real chromium.

**A `*.svelte.spec.ts` does not have to mount anything — the suffix means "needs a DOM", not
"renders a component".**
[poll-services-state.svelte.spec.ts](src/lib/business/store/poll-services-state.svelte.spec.ts) is
the repo's first non-component one and it renders nothing: the module registers `visibilitychange`
/ `focus` listeners and reads `document.hidden`, so its first call throws under the node project,
and the suffix is purely the chromium project's include pattern — the same glob the node project
excludes by. `document.hidden` is a prototype getter, so a spec can only SHADOW it —
`Object.defineProperty(document, 'hidden', { value, configurable: true })`, with
`delete (document as { hidden?: boolean }).hidden` in `afterEach` to hand the real getter back.
`configurable` is what makes that delete possible at all; without it the shadow outlives the file
that set it.

**A `*.svelte.spec.ts` sees no CSS, so it cannot assert a CSS-driven state.** The `client` project
loads no app stylesheet, which makes a class like `invisible` inert there — and inert is not
neutral, it is the opposite answer. `dropdown.svelte.spec.ts` asserted the closed panel's button
WAS reachable by role; `dropdown.stories.svelte` asserts it is not; both passed. That is why
**component specs are down to two**, each covering the one thing the story beside it cannot:
`box-date.svelte.spec.ts` (2 tests — the tick and unmount cleanup, the only deterministic cover of
a one-second interval) and `box-service.svelte.spec.ts` (2 tests — the icon's `naturalWidth` poll
and the unparseable-href branch). The other three were pure duplication of a story that renders the
same component against real CSS, and were deleted. A third spec has to name what a story cannot
reach.

`coverage.exclude` **replaces** vitest's defaults rather than extending them, so
`**/*.{test,spec}.ts` and `**/*.stories.svelte` have to be listed back or the test files are
measured as source and inflate the number. No error, just a wrong figure. There are
deliberately **no `thresholds`** — zenith sets none either, and a floor has to be pinned to a
measured baseline rather than invented.

**Every component has a story, and the story is a test.** Each file in
`presentation/components/` has a `*.stories.svelte` beside it whose `play` functions assert
real behaviour — they run in chromium as part of `npm run test:unit`, so a broken component
fails the suite, not just the storybook UI. **The a11y addon is at `test: 'error'`, so axe runs
against every story and a violation fails `npm run test:unit`.** Keep it there — it is one of the
repo's two automated a11y gates ([is-accessible.e2e.ts](e2e/is-accessible.e2e.ts) is the other,
and the two see disjoint things), and it earned its place immediately: turning it on surfaced a
`link-name` violation no one had reported (box-stats' anchor is empty whenever `stats` is
undefined, so it sat in the tab order announcing nothing). Note axe only ever sees a story's
**rest** state, so the states worth an a11y check have to exist as their own stories rather than
being reached inside a `play` function. The one violation it cannot catch is `document-title` —
the `<title>` lives in the root layout, which no story mounts, so only the e2e audit sees it.

**The e2e axe audit has two limits of its own, both measured, and both are why that file carries
plain assertions beside the audit.** First, **axe cannot require a landmark to EXIST**:
`landmark-banner-is-top-level` only checks a banner that is already there, and `region` is
satisfied by any landmark at all — so the pre-#21 markup, with `<header>` nested inside `<main>`
where it maps to `generic`, passes every axe rule there is. Verified by putting the header back:
the whole audit stayed green. Hence the explicit `getByRole('banner')` test, which does fail on it.
Second, **`color-contrast` is inert on 25 of the 27 themes**: axe's `_getBackgroundColor` bails as
soon as the background stack holds an image or a gradient, so it returns ~23 nodes `incomplete` and
evaluates exactly one — the toast paragraph, the only opaque surface on the page. It is not simply
"themes with a `--background-image`"; `abyss` declares none and is still unreadable, because its
`.theme-helper-3` scenery layer carries a radial-gradient. `solid-light` and `solid-dark` are the
only two axe reads end to end, which is why one named theme is asserted by evaluated-node COUNT.
Neither limit is fixable — contrast through a translucent surface over a photograph genuinely
depends on the pixels — so what the file owes is honesty about which of its 36 tests can go red.

**A `play` function's pointer rests at the canvas origin, so a story can pass without the
interaction it names.** The storybook project drives a real pointer and it starts at (0, 0);
`dropdown`'s wrapper is a full-width block at the top of the canvas, so `.group` matches `:hover`
before any `userEvent.hover` runs — which means "Opens on hover" would pass with `group-hover`
deleted, and "Opens on keyboard focus" did pass with `group-focus-within` deleted. Measured: wrap
that story's template in a `p-16` div, off the origin, and it fails as it should. **That padding is
the assertion; don't tidy it away.** Any new story asserting a hover- or focus-driven CSS state
needs the same offset, and `userEvent.unhover` is not a substitute — it parks the pointer on the
body, whose centre can land back inside the component.

**A wrapper's story is its only test.** A wrapper reads a store and forwards props
([box-service-wrapper.svelte](src/lib/presentation/components/box-service-wrapper.svelte),
[box-stats-wrapper.svelte](src/lib/presentation/components/box-stats-wrapper.svelte)) —
and providing the store context is the only thing that proves the store→prop forwarding, which
nothing else covers.

**One e2e file per feature**, named after it (`e2e/can-change-theme.e2e.ts` — `*.e2e.ts`, so
that `testMatch` separates them from the vitest specs). Playwright
points the preview server at [e2e/fixture-config.json](e2e/fixture-config.json) via
`DASHBOARD_CONFIG`, so the suite never depends on the services of the machine it runs on:
one host that resolves, one that never does, a stats provider on a closed port.

**The fixture's env is part of the fixture.** `webServer.env` spells
`DASHBOARD_SECRET_E2E_ADGUARD` alongside `DASHBOARD_ADMIN_TOKEN` for the same reason the
config is pinned: unset, the load treats the box as an ABSENCE — skipped, no toast — and the
two toast cases in [can-see-provider-stats.e2e.ts](e2e/can-see-provider-stats.e2e.ts) find an
empty live region. That was green on a developer machine off a gitignored `.env` and red on
CI, which has none. The name after the prefix is the fixture's own `"secret": "E2E_ADGUARD"`;
the value is arbitrary apart from the colon AdGuard's provider checks for, and the port it
points at is closed either way.

The host that resolves is the preview server itself, which is why
[playwright.config.ts](playwright.config.ts) pins **IPv4 on both sides** — `HOST`, `PORT`,
`webServer.url` and `use.baseURL` all come off the one `previewUrl` literal, which is the
fixture's `href`. (It was `--host 127.0.0.1` until #28 moved the server from `vite preview` to
`node build`; adapter-node takes its binding from the environment and has no such flag.) Left
unpinned, a server binds the hostname `localhost`, which resolves to `::1` wherever
/etc/hosts maps it (GitHub's runners do) — the browser follows and the page loads, while
`/api/ping` TCP-connects to the literal `127.0.0.1` the config names and gets ECONNREFUSED,
so `marks a reachable service as online` failed on CI and only on CI. Measured: bind preview
to `::1`, and `POST /api/ping {"href":"http://127.0.0.1:4173"}` answers `{"isAlive":false}`
while `GET /` over `[::1]` answers 200. Note `url` does **not** seed `baseURL` the way `port`
does; drop the explicit `use.baseURL` and every `page.goto('/')` fails with "Cannot navigate
to invalid URL".

**A box reflows on its OWN width, not the window's.** Config decides where a component lands
— the same `BoxService` is a third of a row on one page and a full phone width on another, and
the same `Grid` is the whole page or a quarter of it — so a `sm:` breakpoint answers a question
about the window when the question is about the box. Every component that changes shape
declares `@container/<its-name>` and queries that: `box-service` (the status word), `box-date`
(stacked vs. one line), `box-stats` (2 → 3 → 4 readings), `grid` (title size), and `header`
(when the menus stop taking a row of their own). The viewport variants left in the tree are the
ones that genuinely mean the viewport: `xl:col-span-(--span)`, which is where the 12-column page
grid starts honouring config's span at all, and `md:p-page-md` on the `page-shell` wrapper,
which is the page — it was on `<main>` until the banner landmark move took the padding ramp
one element out.
Read the invariant above before writing the first one — the classes go on a child.

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

**`console` has exactly four homes, all of them routes or stores, and `no-console: 'error'`
guards everywhere else.** `business/store/service-store.svelte.ts` (1 — the probe diagnostic),
`+layout.server.ts` (2 — config diagnostics), `[...slug]/+page.server.ts` (5 — config
diagnostics plus the stats and feed operator channels) and `api/stats/+server.ts` (3 — the same
operator channels for the refresh ticks, whose reads reach the network after first paint, so
their failures print here or nowhere). The fourth is #38's doing and the one deliberate widening
of this list: an earlier version of it said "don't add a fourth home", written when the three
covered every read; the endpoint became a reader of the same folds and inherited the same duty.
Measured: a global `no-console` reports 10, the
other two being outside `src` and neither a home — `dps.js`, which [roadmap.md](roadmap.md) #10
deletes, and `scripts/screenshot.js`, a CLI whose whole job is to tell a terminal where it wrote
a file. **#23 has landed, and this is what it bought:** `business/model/config.ts` and
`config-source.ts` printed eight of these and now print none, because a framework-free model
returns its diagnostics instead. What is left is **deliberate and permanent** — the log half of
the no-copy-crosses-a-layer rule, carrying the `AppError.message` that must never reach a toast.
They are unconditional rather than injected precisely because a diagnostic has a fixed sink, and
that is the one thing zenith uses its `logger.ts` for. Don't add a fifth home, and don't reach
for zenith's `no-console: 'error'` + a `logger.ts` to force the issue: a logger module would be a
second seam competing with the injected notify. **`no-console: 'error'` is on**, with those five
homes exempted in [eslint.config.js](eslint.config.js) — plus `dps.js`, until #10 deletes the
file and its block with it. The exemption block sits after every layer block, where nothing can
override it, and the `[...slug]` path is escaped there because minimatch reads unescaped
brackets as a character class — a glob that silently matches nothing.

**One definition per concept.** If you catch yourself writing "mirrors", "same as" or "keep in
sync with", export the thing instead. This repo has exactly three exceptions, all documented
above as load-bearing because **no export can span the two sides**: the six container names in
`business/model/config.ts` versus `config-container.svelte`'s `if/else` chain (a component held
in a variable has no statically known props), the `@theme` scales versus
`extendTailwindMerge` in `style.ts` (one side is CSS), and the paraglide strategy array in
[vite.config.ts](vite.config.ts) versus the argv list inside `package.json`'s `paraglide` script
(the CLI has no config file, so there is nothing for either side to import). Anything else that reads "keep in sync"
is a bug waiting, not a convention.

**Build the simplest thing that does what was asked.** No abstraction for a second caller that
doesn't exist; extract on the _second_ real duplication. Complexity needs a reachable failure
to justify it — if you can't name the inputs and the wrong outcome, the branch doesn't go in;
"defensive" is not a reason. Comments earn their length: a paragraph defending a decision
usually means the decision is too clever. When you notice something unrelated, say it rather
than fix it — a finding reported costs a sentence, a finding fixed costs a review and a bigger
diff for the thing you were actually asked to do. The standing example USED to be live and is now
the proof: five components spread `{...restProps}` onto real DOM nodes for callers that did not
exist, and #22 deleted every one of them. The count in the item was wrong in both directions —
`dropdown`'s caller was real, and `sub-grid`'s spread targets a component rather than a DOM node,
so it stayed. Deleting code to satisfy this is progress, not lost work.

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

The open work lives in [roadmap.md](roadmap.md), ordered by what breaks soonest; the review-pass
items there were adversarially verified against the code, while the entries under "New work"
(2026-08-22) came from reading the shipped app. #33 is the
exception among the review-pass items: its core landed, so what is left of it is the remaining vendor files that plug into
the seam. Several are straight ports from
`zenith`, which has already solved them; those items name the upstream files. It is its own file
because it churns as items land, while this one is the architecture and should not. **Nothing in it
is fixed** — the section below is what is.

## Already done

Not roadmap items — recorded so nobody re-derives them or "fixes" them back.

- **The two stores go through business.** `theme-store` uses
  [business/model/appearance.ts](src/lib/business/model/appearance.ts) (`updateTheme`,
  `updateScenerySeed`, `updateSceneryMotion` — writes only, since #9 took the client read out) and `service-store` uses
  [business/model/service.ts](src/lib/business/model/service.ts). Neither imports a repository. The
  business writers narrow to `ThemeName` on purpose — that's why they aren't pass-throughs.
- **`Result<T>` / `AppError` replaced the old error tuple.** The old shape set `message` only
  on the non-`Error` branch, so every real failure was `message: undefined` and unrenderable.
  Do not reintroduce an optional `message`, and do not add back `code` — it was never assigned.
- **`ServicesStore` hands over data, never words.** Business returns the error; the store
  decides to keep the last known state; the _route_ decides what a human reads. Keep those three
  separate — the earlier version collapsed them and swallowed the error.
- **Failures reach the user as toasts, and the copy is chosen in presentation.** Five things
  about the shape are decisions, not defaults:
  1. **`ToastStore` is set in [+layout.svelte](src/routes/+layout.svelte), not per page**, so a
     failure reported during a navigation outlives the page component being rebuilt.
  2. **[page.svelte](src/lib/presentation/components/page.svelte) takes `notify` as an optional
     prop rather than calling `getToastStore()`.** The route reads the store and hands the
     callback down. A `getContext` there would make the component unmountable without a layout
     above it, and `page.stories.svelte` mounts exactly that — while setting the store from a
     stories file gives every story on the autodocs page one shared context. Left out, the
     failure is still logged by the store; only the toast is missing.
  3. **The stats fold returns `{ stats, failed }`, and the load passes `failedStats`.** Data,
     not a message — see the no-copy rule above. An empty `failed` is reserved for an _absence_
     — no box configured, or a `secret` naming a variable nobody set — because toasting an
     operator's own setup decision would put it in front of every visitor on every page load.
     `{ key, provider, href }` rather than an `'unauthorized' | 'unreachable'` kind, because the
     distinction worth drawing is WHICH BOX, not why: the why is already in the server's log
     line, which names the host and the status, and a user reads the same sentence either way.
     It was one boolean until #33; see "The stats providers" for why an instance list replaced
     it and why a provider list would not have.
  4. **`toasts.show()` takes a finished string.** It is the one thing in `business/store/` that
     could plausibly have wanted a message key, and it must not: keys there would make the store
     name a locale and a catalogue. Callers resolve first.
  5. **This is the second attempt.** The first shipped `adguardError: string` and rendered
     `AppError.message`, on the reasoning that business cannot pick a message so the toast had
     to be English. That was wrong: business does not pick the message, it does not _carry_ one.
     Don't re-derive the first version.
- **The route is `[...slug]`, and `normalizeConfig` drops a `pages` key with no leading slash.**
  See "Config-driven rendering" for why each half exists; the fences are
  [can-navigate-between-pages.e2e.ts](e2e/can-navigate-between-pages.e2e.ts) (a two-segment path
  answers 200) and a `config.spec.ts` case. Don't narrow the route back to an optional parameter
  to "match one segment" — grouped pages are the point.
- **`.dependency-cruiser.cjs` was rewritten** from the stock `--init` template (which reported
  148 violations, all false, and never resolved `.svelte` so most edges were missing from the
  graph). It now has the five layer rules plus
  [tsconfig.depcruise.json](tsconfig.depcruise.json).
- **The registry is gone; the schema replaced it.** `business/component-registry.ts`
  used to map config names to component types via `ComponentProps`, which made the
  config format a derivative of component internals. Business now declares the schema
  and names no component. Don't reintroduce a `ComponentProps`-derived container type,
  and don't reintroduce `ComponentRegistry` / `ComponentName` — neither name exists in
  `src/` any more. A side effect worth keeping: the six Svelte components no longer
  leak into the `/api/ping` server bundle.
- **`BoxService.title` is required**, in the schema — which is now the only place it could
  be said. It was optional in the derived type while the component demanded it, so a
  title-less entry passed validation and rendered an empty heading.
- **Stores live in `business/store/`**, not presentation. The reactive holder is only
  half of what a store does; the other half is orchestration, and that is business. The
  split that makes it safe is `model/` staying framework-free for the SSR path.
- **`readStats` and `readConfig` are business functions.** Route server files
  may not reach `src/lib/data` — see the layer rule.
- **`normalizeContainer` guards required props, and `requiredProps` is gone.** It was a
  `Record<ContainerName, …>` table restating shapes the types already carried, with nothing
  forcing the two to agree — the third "keep in sync" duplicate in a repo that sanctions
  exactly two, and the only one that could be collapsed. The valibot schema is now the single
  declaration and the types are inferred from it. Don't reintroduce the table. What did not
  change: `items` is set unconditionally for `Grid`/`SubGrid` — a grid written before its
  children renders empty instead of throwing in the collectors on the next page load — and a
  container missing a required prop is dropped with a warning while its siblings and its parent
  grid survive.
- **A page whose value is not a record is dropped, and `v.object` will not do it for you.**
  `v.object` accepts an array, so `{"pages": {"/x": []}}` parses as a page with no containers
  — and the navigation links straight to every key it gets, so the result is a dead nav entry,
  which is the same defect the leading-slash check guards. The `isRecord(rawPage)` guard in
  front of the `safeParse` is what stops it, and `config.spec.ts` fences it. It was lost once
  in the valibot migration and caught in review; the test is there so it cannot go again.
- **`Config` deliberately has no `defaults` field.** An earlier note said to add one; that was
  wrong. `Config` is the NORMALIZED shape, and defaults are consumed during normalization
  (merged into props), so nothing downstream ever sees them. The file format has no type at
  all — it arrives as `unknown`. Adding `defaults` there would describe a shape that never
  exists.
- **A stats fetch is bounded** at 3s via `AbortSignal.timeout`, minted in
  [business/model/stats.ts](src/lib/business/model/stats.ts) and handed to the provider — see
  "The stats providers" for why it is not the repository's. Without it, the page load awaited
  undici's defaults: 10s for a box that is switched off, 300s for one that answers the SYN
  then goes quiet.
- **Stats are keyed per instance, and every configured one is read.** `collectStatsTargets`
  (beside `collectServiceProbes`, same traversal) hands the load one target per instance, the
  reads go out under `Promise.all` so the 3s bound above is the cost of the whole page rather
  than of each box in turn, and `StatsStore` answers `stats(provider, href)`. It was one
  `findContainer(page, 'BoxAdguard')` — the FIRST match at any depth — and one value in the store
  that the wrapper handed to every box without reading `props.href`: two instances rendered
  identical numbers and the second host was never contacted. **`findContainer` and its
  `scanContainer` helper are gone**, deleted with the `config.spec.ts` block that was their only
  remaining reader — a helper whose one caller is a test of itself is what `no-orphans` is for.
  `isBoxStats` survives because the collector narrows with it. The key became `provider` + `href`
  and the credential became per-instance when #33 landed; both are under "The stats providers".
- **The stats sit behind a 30s TTL cache, and the page refreshes itself every 60s.**
  `readStats` holds a `Map<key, { readAt, result }>` at module scope in
  [business/model/stats.ts](src/lib/business/model/stats.ts) and returns `{ result, isFresh }`.
  Process state in `business/model` on the same precedent as `config-source.ts`'s stamp cache and
  `admin-auth.ts`'s backoff — a store is unreachable from the SSR path, and a `data/` module would
  be a second file for one caller with no external name to own. The honest consequences, and they
  are in README.md: it is per process, a restart drops it, and two instances behind a load balancer
  can be serving readings a window apart. Five decisions:
  1. **The FAILURE is cached too, and that is the whole item.** A host that is switched off is the
     one paying the repository's 3s bound, so a success-only cache would have left the measured
     `ttfb=2.996s` / `2.954s` exactly where it was. Same reasoning as `config-source.ts` caching a
     read failure against its stamp; here the window expiring is what retries.
  2. **`isFresh` gates the LOG line, not the report.** The failure still crosses in `failed` on a
     cached read — the box is empty either way — while the operator log prints once per window.
     The fold composes its `errors` only for reads that went to the network; unconditional, a
     refreshing tab would put back the per-request spam #23 removed.
  3. **Keyed per instance, not one blob**, so two pages naming different hosts do not evict each other
     and a dead instance does not cost a live sibling its freshness.
  4. **Not pruned, deliberately.** `admin-auth.ts` prunes because a stranger picks its keys; these
     come out of `config.json`, so the set is bounded by a file one operator writes.
  5. **The refresh interval is 60s and must stay `>=` the TTL.** Shorter, and a tick only re-reads
     the cache and the box never moves. It is a `setInterval` in [+page.svelte](src/routes/[...slug]/+page.svelte)
     gated on `document.visibilityState === 'visible'` and cleared by its effect's teardown.
     **Nothing was extracted out of `poll-services-state.ts`, and #18 landing is what settled that** rather
     than making it a duplication: this gate exists to SUPPRESS a tick nobody is reading, while
     #18's wake listeners exist to CREATE the tick the interval never delivered, so one helper
     serving both would carry a flag telling the two apart. Two callers were the argument for
     extracting; the two wanting opposite things is the reason against. (The stats tick has no
     wake listeners on purpose — parity with what it replaced, not an oversight.)
  6. **The tick polls POST `/api/stats`, and the load only paints first render — #38, closing the
     gap #16 recorded.** The refresh used to be `depends('dashboard:stats')` plus `invalidate`,
     which re-ran the WHOLE load every minute, so a bad tick — config caught mid-write answering
     503, or a page key renamed under an open tab answering 404 — swapped the dashboard for the
     error page, and the unmounted page took its interval with it: the tab stayed wrong until a
     manual reload. Nothing on the endpoint's path throws on config drift, so the worst a tick
     can do is change nothing. Six things about it are decisions:
     - **The body NAMES instances and never gets to define them**, `/api/ping`'s shape:
       `{ stats: string[], feeds: string[] }` carries stat keys (`statsKey(provider, href)`
       strings) and feed hrefs, checked against an allowlist built from ALL pages'
       `collectStatsTargets` / `collectFeedTargets` — all pages, like ping's map, because the
       endpoint cannot know which page the caller sits on. Which provider reads which URL and
       with what credential stays the server's decision, and **no credential ever crosses back**.
     - **An unconfigured requested instance is SKIPPED, not refused** — deliberately quieter than
       ping's 403. One stale key (a box deleted under an open tab) must not take the tick's other
       answers down with it, or config drift would freeze every live box until reload: a small
       version of the park this endpoint exists to close. The silence also keeps the endpoint
       from confirming unconfigured keys to a probing caller.
     - **No rate limit, unlike `/api/ping`.** There the cost per call was an unconditional connect
       to a host; here the TTL cache bounds what ANY number of calls can spend — each configured
       instance reaches the network at most once per window however hard the endpoint is hit. If
       that stops being true, #45's budget is the precedent to reach for.
     - **Both callers share one fold.** `readStatsFor(targets, env)` in
       [business/model/stats.ts](src/lib/business/model/stats.ts) plans the reads, resolves each
       credential VERBATIM off the environment record handed in (R1 — the model imports nothing),
       skips a named-but-unset variable once-per-process-per-variable, and returns
       `{ stats, failed, errors, warnings }` with finished log lines minted like
       `normalizeConfig`'s warnings. Printing stays in the routes. `readFeedsFor(hrefList)` is
       the same seam minus credentials. The endpoint was the SECOND caller of what had been the
       load's private `planReads`/folding — extraction on the second real duplication.
     - **First paint stays SSR, and the client merges answers as an overlay over `data`.**
       Until the first tick lands the payload IS the picture; once one lands, it owns it — an
       answered instance replaces its entry, a failed one is DELETED outright, so its box falls
       back to its unavailable line instead of quietly showing yesterday's numbers beside a toast
       saying they are gone. A client-side navigation reuses the component with someone else's
       payload, so the overlay drops on every new `data` and a response that outlives the data it
       was asked for is discarded.
     - **The interval stays ON the page, not above it.** Moving it into the layout was the other
       recorded option, surviving the error-page swap — but the swap is gone, and staying keeps
       the `refreshable` gate that skips installs with no live boxes. Feeds ride the same
       endpoint and the same gate: they already counted in `refreshable`, and one round trip per
       tick for both beats two endpoints. The operator log survives because the ENDPOINT prints
       its folds' fresh failures — after first paint those are the only reads reaching the
       network — which is what made `console`'s homes FOUR (Conventions).
- **A stats toast is raised once per failure EPISODE, through a plain `let` in the route.**
  `ToastStore` dedupes against what is currently on screen, so it cannot cover a periodic
  refresh: every tick hands `[...slug]/+page.svelte` a new failure list, the `$effect` re-runs on
  it, and a toast the user dismissed — or that timed itself out after `TOAST_MS` — came straight
  back, unattended, forever. `reportedFailures` is a `string[]` keyed the same way
  the readings are, and an entry is dropped as its instance recovers, so a box that fails again is
  reported again — the boolean's behaviour, one per instance. It is a list and **not a `Set`**
  because `svelte/prefer-svelte-reactivity` rejects a mutable built-in `Set` in a component, and a
  reactive one is the opposite of what this needs; it holds one entry per stats box, so `includes`
  is right. Three things it is also **not**:
  not `$state` (nothing renders it, and the effect must not depend on it), not a "seen" set in
  `ToastStore` (that store is shared with the probe toast, and its dedupe-by-message is a recorded
  decision), and not a message key crossing into business. `ToastStore.show`'s `untrack` is
  untouched — it closes the self-retrigger loop and was never about an external one — but this
  flag is what took its e2e fence away, which the "Errors are values" section spells out.
- **The service poll re-polls on a wake, and BOTH halves are gated.** `pollServicesState` is
  still one `poll()`, one `setInterval(poll, 15min)` and one teardown, plus a `visibilitychange`
  listener on `document` and a `focus` listener on `window` — both are needed, because switching
  to another application leaves `visibilityState` at `visible` while a tab switch inside the
  browser raises `visibilitychange` — and both are removed by the teardown that already cleared
  the interval and aborted the signal. Three decisions sit on top of the item as written:
  1. **The `document.hidden` guard lives in `poll()` itself**, so the interval AND the eager
     first poll are both gated by it. Throttled is not the same as not firing: an 8-hour
     background stint still delivers ~32 ticks, which for a dozen services is hundreds of round
     trips, each carrying a diagnostic and a toast for a reader who is not there. The corollary
     is accepted rather than patched: a page loaded into a background tab skips its first poll,
     and the `visibilitychange` listener is what covers it on the way back.
  2. **The wake path carries an ELAPSED guard — a wake polls only once `POLL_INTERVAL_MS` has
     passed since the last poll — and that is not caution.** Without it the re-poll rate is
     bounded by nothing but how often somebody changes windows, and it re-raised a probe failure
     the user had already dismissed: `ToastStore` dedupes against what is CURRENTLY on screen and
     a toast clears itself after `TOAST_MS` (6s), so dismiss, click into another app, click back
     handed it straight back — where before #18 a dismissal bought 15 minutes. That is the defect
     class `reportedFailures` exists for, one bullet up. The guard is also the item's own
     rationale stated as a condition — "has a tick been MISSED", because `setInterval` does not
     catch up — and it is what makes both events firing on one return a single poll rather than a
     duplicate round trip.
  3. **`lastPolledAt` is assigned AFTER the hidden guard**, so a throttled tick that returned
     early does not count as a poll and therefore cannot suppress the wake behind it. Mutating
     that order is what a mutation audit of the file turned up; nothing else separates the two
     guards.
- **The docs were corrected against the code**, so don't restore the old wording from memory or
  from an older checkout. What changed: the seven module paths the `refactor(layers)` commit
  stranded (three were 404 links); the render-pipeline diagram, which named a `server/config.ts`
  that never existed and put the mtime cache in the wrong layer; `Record<ComponentName, …>` →
  `Record<ContainerName, …>`; a phantom `ComponentRegistry` bullet in this very section,
  contradicting the "registry is gone" one above it; the claim that a missing translation fails
  the build (it does not — see Invariants); and the unrecorded `solid-light` `@custom-variant`
  carve-out. [docs.spec.ts](src/lib/test/docs.spec.ts) — #29's fence — is what catches that class now.
- **`/api/ping` opens a TCP connection to `host:port`; it does not ICMP the host.** The dot
  claims a service is up, and ICMP only ever answered for the box — a dead service on a live
  host stayed green and two boxes on one host could never disagree. The allowlist is keyed on
  `host:port` for the same reason, so a configured host does not open its other ports. Don't
  reintroduce the `ping` package: it also cost a fork+exec per unauthenticated POST, threw an
  unhandled rejection when the binary was missing from a slim image, and kept the brackets on
  an IPv6 literal (`new URL('http://[fd00::5]/').hostname`). `toEndpoint` strips them.
- **`/api/ping` is rate-limited per client address.** `takePingLimit`
  ([ping-limit.ts](src/lib/business/model/ping-limit.ts), beside `admin-auth.ts`) is that file's
  backoff map reduced to a flat budget — 300 probes per rolling minute, a kind plus a number out
  of the model, the route picking the 429 words. Five decisions: the slot is taken BEFORE the body
  parses, so a throttled caller costs no work at all; every attempt counts, not only answered
  ones — the budget bounds the work, and even the refusal paths cost a parse and a config read;
  the ceiling is sustained rather than lifetime, so a window that drains buys a fresh budget and
  the dashboard's own poll can never be locked out for good; it is per-address only, as auth on
  ping was refused — behind a proxy that hides addresses it goes global, which is accepted; and
  the budget sits at 300 because it is sized by MEASUREMENT against the burst profile, not the
  steady state — every page load eagerly probes every configured service, and the e2e suite
  measured 163 probes in its busiest rolling minute (4 fixture boxes, every test loading a page,
  all from one address), so anything in the "few dozen" range ships a flake factory.
- **A `BoxService` chooses its own probe, and the endpoint resolves the mode from the FILE.**
  `probe: 'tcp' | 'http' | 'none'` — `collectServiceProbes` in
  [config.ts](src/lib/business/model/config.ts) carries it, `configuredTargets` in
  [+server.ts](src/routes/api/ping/+server.ts) maps `host:port` → mode, and the poll ships the
  href alone. Six things about it are decisions:
  1. **`tcp` stays the default because it is more accurate for the thing this app is for.**
     Proxmox, TrueNAS, Unifi and Portainer all ship self-signed certificates that Node's
     `fetch` rejects outright with no per-request escape hatch (the same wall
     [roadmap.md](roadmap.md) #33 hits), and several answer `401`/`302` at `/`. An HTTP probe
     calls all of those offline. Going the other way is not a matter of taste either — see
     the ladder in the README table; rung 2 is what a LAN service can actually answer.
  2. **`http` exists because a connect to a shared origin is a CONSTANT, not a measurement.**
     GitHub Pages accepts every connection, so `tcp` on
     `https://community-scripts.github.io/ProxmoxVE/` is green whether or not the page is
     there. That is not a wrong answer — it is a true answer to a question nobody asked, which
     is why the fix was a second mode rather than a change to the first.
  3. **The mode is NEVER taken from the request.** The endpoint is unauthenticated, so a
     client-supplied mode is a client-supplied behaviour: anyone on the LAN could ask the
     server to issue HTTP requests instead of opening a socket. The href in the body selects
     an allowlist entry and nothing more — the URL actually fetched is the config's, which is
     also why `Target` carries `href` beside `endpoint`.
  4. **`redirect: 'manual'`, and a 3xx counts as answering.** Following redirects would let an
     allowlisted host bounce the probe at an address the operator never configured, turning it
     into a boolean oracle for that address. Counting a 3xx as alive is what keeps that choice
     from calling every `http:`→`https:` entry offline. Both halves are fenced in
     [ping.spec.ts](src/routes/api/ping/ping.spec.ts), which runs a real `node:http` server
     because the `net` listener that covers `tcp` accepts a connection and then says nothing —
     precisely the case `http` exists to tell apart.
  5. **`none` is excluded from `collectServiceProbes`, not filtered by each caller.** Both
     callers are consequences of appearing in that list: the poll measures it, and the
     allowlist lets an unauthenticated POST reach it. A bookmark that was merely undrawn would
     still be probed on request. This is why the mode beat the `BoxBookmark` container
     [roadmap.md](roadmap.md) #25 proposed — one prop, no second near-identical component, and
     `collectServiceProbes` was already reading `props.href` so it is not a new crossing.
  6. **The component drops BOTH marks, not just the dot.** The word alone still asserts a
     state; the dot alone puts colour back in sole charge of what the pair exists to carry.
     Its own story, because axe only ever sees a story's rest state.
- **`config.json` is gitignored; [config.example.json](config.example.json) is the tracked
  one.** It is production's default read path _and_ the internal network map, so tracking it
  meant a `git pull` during an update silently reverted the live dashboard.
- **[box-date.svelte](src/lib/presentation/components/box-date.svelte)'s `Intl` formatter is at
  instance scope.** The module body runs once per node process while the locale is per request,
  so hoisting it back freezes every SSR response to the first visitor's locale. An optional
  `timezone` prop threads into both formatters — `timeZone: undefined` falls through to the
  viewer's own zone — and is validated inside the schema by asking Intl itself (`new
Intl.DateTimeFormat(undefined, { timeZone })` in a try/catch), because an unknown zone throws
  `RangeError` at format time, during SSR; that probe is the exact predicate for "throws later",
  which is why it beats `Intl.supportedValuesOf('timeZone')` — measured on node, neither `UTC`
  nor case-variant spellings are in that list, yet Intl formats both. A bad one drops the
  container with the standard warning like every other invalid prop. A pinned box renders
  identically on server and client, which retires the one clock-shaped hydration variable for that
  config.
- **The zenith parity pass (2026-08-04) is settled; these are its decisions, not defaults.**
  Tooling was brought in step with `zenith` in one pass. What was taken, and what was
  deliberately refused:
  - **Taken:** `prettier.config.js` at zenith's `tabWidth` accounting; `eslint-config-prettier`
    - `svelte.configs.prettier` with the five rules zenith sets; zenith's cruiser rule set
      (`no-circular` and `no-orphans` at `error`); the CSS seed-name migration; vitest coverage +
      HTML reporters under `test-result/`; zenith's playwright shape; `.storybook/preview.ts`'s
      theme toolbar and scenery mount; a story per component; `.github/workflows/ci.yml`.
  - **Refused, with reasons that still hold:** `no-console: 'error'` and a `logger.ts` (the
    injected notify callback is this repo's report seam and an unconditional `console` its log
    sink, so a logger module would be a second seam competing for the same job); `prettier-plugin-tailwindcss` (measured: 0 files changed at
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
    `import.meta.dirname` now. vitest-browser-svelte 3 made `render()` **async**, and every
    call site in the `*.svelte.spec.ts` files was migrated to `await` it inside an `async`
    `it()` callback — a sync `render` yields a `Promise` whose `getByRole` is undefined,
    which `svelte-check` catches. **TypeScript is capped at 6, not 7**: `svelte-check@4` peers
    `typescript@^5 || ^6`, and typescript-eslint 8 peers `<6.1.0`. `@types/node` stays on
    **22** to match `engines.node` rather than tracking the newest major.
  - The vitest 4.x family **cross-peer-pins exact versions**, so `@vitest/coverage-v8` is
    pinned to vitest's exact minor rather than caret-ranged. It moves as one unit or not at
    all; npm's peer check makes any drift a loud `ERESOLVE`, not a silent mismatch. The trap
    is that a **stale `node_modules` also counts** as a pin: npm reads the installed tree as
    "Found", so bumping the family reports `ERESOLVE` even when the manifest resolves cleanly
    from scratch. Regenerate the lock with an empty tree (`npm install --package-lock-only` in
    a clean directory), then `npm ci` — `npm audit fix --force` instead offers a `@vitest/ui`
    "outside the stated range" and is not what you want.
  - **`cookie` GHSA-pxg6-pf52-xh8x (3 low) has no upstream fix and is left open.**
    `@sveltejs/kit@2.70.2` — the version pinned here — depends on `cookie@^0.6.0`, so
    `npm audit` reports it on a fully-updated tree; `--force` "fixes" it by proposing
    `@sveltejs/kit@0.0.30`. An `overrides` block pinning `cookie@^0.7.2` clears it and was
    deliberately **refused** — kit's own peer range is the thing to wait on. Re-check when kit
    releases past 2.70.2.
  - `.dependency-cruiser.cjs` is a **superset** of zenith's, not a copy — ours adds
    `leaf-not-to-upper-layers` (zenith has no `lib/utils`) and carries zenith's inert
    `logger-imports-nothing`. A byte-identical shared file would need a matching change in
    zenith, which this pass deliberately did not touch.
  - **`themes.css` and `tokens.css` now diverge from zenith by one theme, on purpose: `fallow`
    out, `revie` in.** `fallow` is zenith's own signature palette, so carrying it here shipped
    another project's brand; `revie` takes its slot in all three hand-edited places plus a
    `scenery/revie.css` zenith has no counterpart for, and the catalogue is still 27 entries with
    26 `@custom-variant` rules. The first-visit defaults moved with it: `DEFAULT_THEME` is
    `glass-light` and `DEFAULT_DARK_THEME` is `revie`. `revie` **cannot** be the light default —
    its `css` is `['revie', 'dark']`, so stamping it on a light-preferring OS is the wrong first
    paint; the light branch gets the frosted light theme nearest it instead. Everything else
    still pastes from upstream; a paste that reintroduces `fallow` is the one thing to reject.
    **Second divergence, 2026-08-05: `--surface-inset` in the 15 dark blocks, plus the one in
    `base.css`.** See the compositing invariant above for why. A theme pasted from zenith
    arrives with the old `0.1` — halve it on the way in, the way `fallow` gets dropped.
- **`src/lib/test/` is under no layer constraint.** No eslint layer block and no cruiser layer
  rule matches it, so the two harnesses that live there —
  [stats-store-harness.svelte](src/lib/test/stats-store-harness.svelte) and
  [theme-store-harness.svelte](src/lib/test/theme-store-harness.svelte) — may import from any
  layer with nothing to stop them. That is fine for test support and is why they live there
  rather than under `presentation/` — but it means an import _from_ this directory into app code
  would look legal and is not. They exist because `setContext` needs a component being
  initialised, so a story or spec wanting its own store has to mount one; setting the store from a
  stories file instead gives every story on the autodocs page one shared context, and the last
  play function to run decides what all of them show.
