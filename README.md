# Revie Dashboard

A self-hosted start page for home services: every box on it comes from `config.json`,
which is read from disk at runtime.

![The dashboard: a date box, AdGuard Home stats, and two sub-grids of services with
status dots](docs/screenshot.png)

## Running

Needs **node 22 or newer**. That is declared in `package.json`'s `engines`, and `.npmrc` sets
`engine-strict=true`, so an older node fails `npm install` outright rather than warning.

```sh
npm install
cp config.example.json config.json   # the boxes on the page
cp .env.example .env                 # AdGuard credentials, optional
npm run dev
```

Production:

```sh
npm run build
node build            # reads ./config.json relative to the working directory
```

## Configuration

`config.json` maps URL paths to a list of containers. Every container names a
component from [the config schema](src/lib/business/model/config.ts) and passes its
props:

```json
{
	"defaults": {},
	"pages": {
		"/": {
			"name": "Home",
			"containers": [
				{ "name": "BoxDate" },
				{
					"name": "Grid",
					"props": {
						"title": "Services",
						"items": [
							{
								"name": "BoxService",
								"props": {
									"title": "Proxmox",
									"href": "https://192.168.178.180:8006",
									"span": 6,
									"img": { "src": "https://cdn.simpleicons.org/proxmox" }
								}
							}
						]
					}
				}
			]
		}
	}
}
```

- `defaults` holds per-container props applied to every instance of that container.
- A page key is a URL path and has to start with `/`. It may have more than one
  segment, so `"/media/plex"` works and is how pages are grouped. A key without the
  leading slash is dropped with a warning, because the navigation links straight to it
  and a relative link would land on a different page than it names.
- A path that is not listed under `pages` returns 404.
- A malformed container is dropped with a warning instead of breaking the page: an
  unknown container name, something that isn't an object, or a missing required prop
  (`BoxService` needs `title`, `href` and `img.src`; `BoxAdguard` needs `href`). Its
  siblings and its parent grid still render.
- A `Grid` or `SubGrid` with no `items` renders as empty, so a grid written before its
  children is safe to save.
- `DASHBOARD_CONFIG` overrides the config path. The file is re-read whenever its
  mtime changes, so edits apply without a restart.

`config.json` is gitignored, and [`config.example.json`](config.example.json) is the
tracked starting point — your own copy holds your internal hostnames and ports, and it
is the same file `node build` reads, so tracking it would let a `git checkout` revert
the live dashboard.

### Layout, and why there are no class names in the config

`span` (1–12) sets how many of the twelve grid columns a box takes from the `xl`
breakpoint upwards; below that every box is full width.

Tailwind compiles CSS at build time by scanning the source, so a class name that
only ever appears in runtime config produces no CSS — it would silently do nothing.
Config therefore carries tokens, not classes: `span` is emitted as a `--span`
custom property and read by the static `xl:col-span-(--span)` utility, so any value
works without regenerating CSS. Anything else that needs to be configurable should
follow the same shape — a named token in the config, mapped to literal classes in
the components.

## Services and status dots

Each `BoxService` is probed through `POST /api/ping` every 15 minutes. The probe opens a
TCP connection to the `href`'s own host **and port** — so a dead service on a live host
reads as offline, and two boxes on one host can disagree. A scheme without a port to
connect to is rejected. The endpoint only probes `host:port` pairs that appear in
`config.json`; anything else is rejected too.

A dot only changes when a probe answers. A probe that **fails** — a network drop, a
proxy erroring — says nothing about the service, so the dot keeps its last known state
and a dismissible message names the service at the bottom of the page instead. An
unreachable AdGuard box gets one too, which is otherwise visible only as an empty box.
Each clears itself after a few seconds, a failure that repeats does not stack up, and
both follow the page language. The technical detail behind them — `fetch failed`, an
HTTP status, the host — goes to the server's log rather than the screen, so check there
when the message is not enough.

## Languages

Every piece of user-facing text goes through Paraglide. The catalogues live in
[`messages/`](messages) — `en` is the base locale, `de` is translated. Add a key to
both files and use `m.<key>()`; the compiler regenerates `src/lib/paraglide` on every
vite run and typechecks the message parameters.

Add the key to **both** catalogues, though — a missing translation fails nothing. For a
locale lacking a key the compiler emits `const de_<key> = en_<key>;` and succeeds, so the
German page silently renders English.

The locale is kept in a cookie and switched from the header dropdown. Page names come
from `config.json` and are shown as written.

## Checks

```sh
npm run check      # svelte-check
npm run lint       # prettier + eslint + lint:deps
npm run lint:fix   # eslint --fix (run this BEFORE `format`, never after)
npm run lint:deps  # dependency-cruiser: the data -> business -> presentation rule
npm run depgraph   # regenerate dependency-graph.svg (needs graphviz `dot`)
npm run test:unit  # vitest (node + browser + storybook), writes coverage
npm run test:e2e   # playwright
npm run storybook  # storybook dev on :6006
```

`lint:deps` is part of `lint` and is at zero. Every push runs the same gates in CI
([.github/workflows/ci.yml](.github/workflows/ci.yml)), which uploads the playwright report and
the coverage report as artifacts. The open work is in [roadmap.md](roadmap.md);
[AGENTS.md](AGENTS.md) is the architecture and the invariants that break silently.

### Where a test belongs

- `*.spec.ts` runs in node, `*.svelte.spec.ts` in a real Chromium, and `*.stories.svelte`
  in a third project that runs each story's `play` function as a test. Components and
  anything touching the DOM go in the browser project. Test files are not compiled as
  rune modules themselves, so they cannot use `$state` or `$effect` — a store whose
  constructor registers effects has to be built inside a component.
- Every component has a story beside it, and the story's `play` function is a real test —
  `npm run test:unit` runs them, so a broken component fails the suite.
- Wrappers get a story but no `*.svelte.spec.ts`. A wrapper reads a store and forwards
  props (`box-service-wrapper`, `box-adguard-wrapper`); the component next to it takes the
  same data as a plain prop and is tested directly, so a spec would just duplicate it —
  but only a story can supply the store context and prove the forwarding.
- One e2e file per feature, named after it (`e2e/can-change-theme.e2e.ts`).
  Playwright points the preview server at `e2e/fixture-config.json`, so the suite
  never depends on the services of the machine it runs on: the preview server's own
  port as the reachable service, a host that never resolves, and an AdGuard instance on
  a closed port.
