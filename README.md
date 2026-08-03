# Revie Dashboard

A self-hosted start page for home services: every box on it comes from `config.json`,
which is read from disk at runtime.

![The dashboard: a date box, AdGuard Home stats, and two sub-grids of services with
status dots](docs/screenshot.png)

## Running

```sh
npm install
cp .env.example .env   # AdGuard credentials, optional
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
- A path that is not listed under `pages` returns 404.
- A malformed container is dropped with a warning instead of breaking the page: an
  unknown container name, something that isn't an object, or a missing required prop
  (`BoxService` needs `title`, `href` and `img.src`; `BoxAdguard` needs `href`). Its
  siblings and its parent grid still render.
- A `Grid` or `SubGrid` with no `items` renders as empty, so a grid written before its
  children is safe to save.
- `DASHBOARD_CONFIG` overrides the config path. The file is re-read whenever its
  mtime changes, so edits apply without a restart.

Keep your own `config.json` out of git — it holds your internal hostnames and ports, and
it is the same file `node build` reads, so a `git checkout` would revert the live
dashboard. Point `DASHBOARD_CONFIG` at it, or gitignore it.

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

Each `BoxService` is pinged through `POST /api/ping` every 15 minutes. That endpoint
only probes hosts that appear in `config.json`; anything else is rejected.

## Languages

Every piece of user-facing text goes through Paraglide. The catalogues live in
[`messages/`](messages) — `en` is the base locale, `de` is translated. Add a key to
both files and use `m.<key>()`; the compiler regenerates `src/lib/paraglide` on every
vite run and typechecks the parameters, so a missing translation fails the build
instead of the page.

The locale is kept in a cookie and switched from the header dropdown. Page names come
from `config.json` and are shown as written.

## Checks

```sh
npm run check      # svelte-check
npm run lint       # prettier + eslint + lint:deps
npm run lint:deps  # dependency-cruiser: the data -> business -> presentation rule
npm run depgraph   # regenerate dependency-graph.svg (needs graphviz `dot`)
npm run test:unit  # vitest (node + browser)
npm run test:e2e   # playwright
```

`lint:deps` is part of `lint` and is at zero; the open work is listed in
[AGENTS.md](AGENTS.md), which is also where the architecture, the invariants that break
silently, and the roadmap live.

### Where a test belongs

- `*.spec.ts` runs in node, `*.svelte.spec.ts` in a real Chromium. Components and
  anything touching the DOM go in the browser project. Test files are not compiled as
  rune modules themselves, so they cannot use `$state` or `$effect` — a store whose
  constructor registers effects has to be built inside a component.
- Components are tested, wrappers are not. A wrapper reads a store and forwards props
  (`box-service-wrapper`, `box-adguard-wrapper`); the component next to it takes the
  same data as a plain prop and is tested directly.
- One e2e file per feature, named after it (`e2e/can-change-theme.spec.ts`).
  Playwright points the preview server at `e2e/fixture-config.json`, so the suite
  never depends on the services of the machine it runs on: one host that resolves, one
  that never does, and an AdGuard instance on a closed port.
