# Revie Dashboard

A self-hosted start page for home services: every box on it comes from `config.json`,
which is read from disk at runtime.

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
component from [the registry](src/lib/utils/component-registry.ts) and passes its
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

- `defaults` holds per-component props applied to every instance of that component.
- A path that is not listed under `pages` returns 404.
- A malformed container is dropped instead of breaking the page.
- `DASHBOARD_CONFIG` overrides the config path. The file is re-read whenever its
  mtime changes, so edits apply without a restart.

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
npm run lint       # prettier + eslint
npm run test:unit  # vitest (node + browser)
npm run test:e2e   # playwright
```

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
