# Revie Dashboard

A self-hosted start page for home services: every box on it comes from `config.json`,
which is read from disk at runtime.

![The dashboard: a date box beside wider AdGuard Home stats, then a grid of services in
labelled sub-grids of differing widths — two thirds beside a third, three thirds, two
halves — each service showing an online or offline status dot](docs/screenshot.png)

That is `config.example.json` rendered — the same file the next section tells you to copy.
`npm run screenshot` regenerates it, stubbing AdGuard and the status probes so none of the
services have to be reachable. Point `DASHBOARD_CONFIG` at another file to shoot that one
instead.

## Running

Needs **node 22 or newer**. That is declared in `package.json`'s `engines`, and `.npmrc` sets
`engine-strict=true`, so an older node fails `npm install` outright rather than warning.

```sh
npm install
cp config.example.json config.json   # the boxes on the page
cp .env.example .env                 # optional; provider secrets are DASHBOARD_SECRET_<NAME>
npm run dev
```

Production:

```sh
npm run build
node --env-file=.env build   # reads ./config.json relative to the working directory
```

`--env-file` is not optional. Only `npm run dev` reads `.env`, through vite; nothing in the build
output does, so a bare `node build` starts cleanly with every `DASHBOARD_SECRET_<NAME>`,
`DASHBOARD_ADMIN_TOKEN` and `DASHBOARD_CONFIG` silently unset — a working-looking deploy with empty
stats boxes and no admin area.

That `./config.json` is resolved against the process working directory, so `DASHBOARD_CONFIG` (see
[Configuration](#configuration)) has to be **absolute** as soon as something other than you starts
the server: a service manager's working directory is not the repo.
[`deploy/revie-dashboard.service`](deploy/revie-dashboard.service) is a unit that does both, using
`EnvironmentFile=` rather than `--env-file` — one env mechanism per invocation, not two.

Serving on anything but `localhost` / `127.0.0.1` also needs `ORIGIN` set to the address you serve
on — see [the admin area](#the-admin-area) for both things that depend on it.

### Docker

A [Dockerfile](Dockerfile) builds an image from the repo — the build output alone is not
standalone (it imports `svelte` and `@sveltejs/kit` from `node_modules` at runtime), so the image
carries the build **plus the full `node_modules`**, devDependencies included:

```sh
docker build -t revie-dashboard .
docker run -p 3000:3000 \
	-v ./dashboard:/config \
	-e ORIGIN=http://192.168.1.10:3000 \
	revie-dashboard
```

It runs as the unprivileged `node` user, and a `HEALTHCHECK` asks `GET /api/health`, so an
orchestrator can tell a live dashboard (200) from one whose config failed to load (503).
`DASHBOARD_CONFIG` defaults to `/config/config.json`; mount your config **directory** there, not
the lone file — the admin editor writes a `.tmp` beside the target and renames it into place,
which a bind-mounted single file cannot do. Everything deployment-specific passes through the
environment at run time (`-e` or `--env-file`): `ORIGIN`, `DASHBOARD_ADMIN_TOKEN`, and one
`DASHBOARD_SECRET_<NAME>` per configured credential. None of it is baked into the image, and
neither your `config.json` nor any `.env` can enter a layer — both are excluded in
[.dockerignore](.dockerignore).

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
- `BoxService` takes an optional `"probe"` deciding how its status dot is measured. It
  is the one prop with a fixed set of values, so the editor offers them as a list:

  | `probe`         | What it measures                                                                 |
  | --------------- | -------------------------------------------------------------------------------- |
  | `tcp` (default) | A TCP connection to the host and port in `href`                                  |
  | `http`          | A `HEAD` request to the whole `href` — the path has to answer, not just the port |
  | `none`          | Nothing. No dot, never polled, never reachable through `/api/ping`               |

  Leave it out for anything on your own network. `tcp` is what tells a dead service on
  a live box from a healthy one, and it is the only mode that works for the many
  self-hosted services behind a self-signed certificate (Proxmox, TrueNAS, Unifi,
  Portainer) or answering `401` at `/` — `http` reports both of those as offline.

  Reach for `http` when the host itself proves nothing: a page on a shared origin like
  GitHub Pages always accepts a connection, so `tcp` shows a green dot whether or not
  the page exists. Note a `401`, `403` or a `405` to `HEAD` reads as offline here; a
  redirect counts as online, and is not followed.

  Use `none` for a plain bookmark. It is the only mode that keeps the entry out of
  `/api/ping`'s allowlist, so it is what you want for a link to somewhere on the public
  internet that you never wanted a status for.

- `BoxStats` reads live numbers off a service. `provider` picks which one — see
  [Stats providers](#stats-providers) — `href` is where that instance lives and what the
  box links to, and `secret` names the environment variable holding its credential.
  A page may hold as many as it likes: each is read separately and keyed by its own
  provider **and** href, so two instances show their own numbers and can have two
  different logins.
- **Stats readings are cached for 30 seconds and the open page re-reads them every
  minute**, so a reading on screen can be up to about a minute and a half old — and a
  box that has just come back can take that long to fill in. The cache is what keeps an
  instance that is switched off from costing every visitor the 3-second timeout before
  the page renders at all. It lives in the server process, so a restart drops it and a
  second instance behind a load balancer keeps its own; the page stops re-reading while
  its tab is in the background.
- `BoxDate` shows today's date and a running clock, in each visitor's own timezone.
  An optional `"timezone"` pins it to one IANA zone instead, so everyone sees the
  same box wherever they are:
  `{ "name": "BoxDate", "props": { "timezone": "Australia/Sydney" } }`. A zone the
  runtime doesn't know is dropped with a warning like any other invalid prop, so
  spell it as in the tz database (`Europe/Berlin`).
- `BoxSearch` is a search box for whatever engine you run. `href` is the engine's endpoint —
  what the form submits to — and `placeholder` is optional; leave it out and the box says
  "Search". Pressing `/` anywhere on the page puts the cursor in it, and Enter submits.

  The query is always sent as `q`, which is what Whoogle, SearXNG, Google and DuckDuckGo all
  read:

  ```json
  { "name": "BoxSearch", "props": { "href": "http://192.168.178.192:5000/search", "span": 6 } }
  ```

  > **Do not put a query string in `href`.** A GET form REPLACES it, so
  > `https://duckduckgo.com/?ia=web` submits as `https://duckduckgo.com/?q=…` and the `ia=web`
  > is gone with no warning anywhere. Put engine options in the path, or configure them on the
  > engine itself.

- **Quick jump** (`Ctrl`/`Cmd` + `K`). A palette over the page listing every configured
  page plus the services on screen; type to filter by name or address, arrows move,
  `Enter` opens. A page navigates within the dashboard, a service opens in a new tab.

- `BoxFeed` renders a newsfeed — RSS 2.0, Atom or RDF — as a list of linked titles,
  newest first. `href` is the feed URL, read server-side on every page load (most feeds
  refuse a browser-side fetch), and an optional `"limit"` caps how many rows show —
  ten by default, fifty at most however many the feed carries:

  ```json
  { "name": "BoxFeed", "props": { "href": "https://example.org/feed.xml", "limit": 5 } }
  ```

  Entries without both a title and a link are skipped rather than failing the box, so
  one broken item costs itself. Two boxes may name one feed with different limits; the
  read happens once between them.

- **Feeds are cached for 5 minutes**, like the stats cache but slower, because feeds
  change hourly at best: an open tab shows a list up to about six minutes old, and a
  source that just came back can take that long to fill in. The cache lives in the
  server process, so a restart drops it.

- **Feeds cover more than news.** Anything publishing RSS or Atom renders, and several
  sources answer widgets other dashboards ship as dedicated boxes:

  | Source                 | Feed URL                                                   |
  | ---------------------- | ---------------------------------------------------------- |
  | A project's releases   | `https://github.com/<owner>/<repo>/releases.atom`          |
  | A repository's commits | `https://github.com/<owner>/<repo>/commits.atom`           |
  | A YouTube channel      | `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>` |
  | A subreddit            | `https://www.reddit.com/r/selfhosted/.rss`                 |
  | Hacker News            | `https://hnrss.org/frontpage`                              |

  Most blogs publish one too — look for `/feed`, `/rss` or `/atom.xml`. A release feed
  reads better with a small `"limit"` (3 or 5) than with the default ten rows.

- `BoxNote` renders static text out of config — the one container with nothing to
  read and nothing to fail. `text` is required and shown as written: line breaks
  preserved, no markdown, no translation.

  ```json
  {
  	"name": "BoxNote",
  	"props": { "text": "Trash collection on Thursdays.\nWi-Fi: see the router sticker.", "span": 4 }
  }
  ```

  What you type is what renders — a `**bold**` keeps its asterisks. There is no
  `title`; if the note needs one, put it in the text or give the Grid above it a
  heading.

- A page key is a URL path and has to start with `/`. It may have more than one
  segment, so `"/media/plex"` works and is how pages are grouped. A key without the
  leading slash is dropped with a warning, because the navigation links straight to it
  and a relative link would land on a different page than it names.
- A path that is not listed under `pages` returns 404.
- A malformed container is dropped with a warning instead of breaking the page: an
  unknown container name, something that isn't an object, or a missing required prop
  (`BoxService` needs `title`, `href` and `img.src`; `BoxStats` needs `provider` and
  `href`; `BoxSearch` needs `href`; `BoxFeed` needs `href`; `BoxNote` needs `text`).
  Its siblings and its parent grid still render.
- A `Grid` or `SubGrid` with no `items` renders as empty, so a grid written before its
  children is safe to save.
- `DASHBOARD_CONFIG` overrides the config path. The file is re-read whenever its
  mtime changes, so edits apply without a restart.

`config.json` is gitignored, and [`config.example.json`](config.example.json) is the
tracked starting point — your own copy holds your internal hostnames and ports, and it
is the same file `node build` reads, so tracking it would let a `git checkout` revert
the live dashboard.

> **Migrating from `BoxAdguard`.** It is gone; `BoxStats` with `"provider": "adguard"`
> replaces it. An un-migrated `config.json` does not merely lose the box: the unknown name
> is a normalization warning, `/admin` refuses to save a config that produces one, and the
> editor drops to the **raw JSON textarea for the whole file** until the name is fixed by
> hand. That is the repair path working as designed, and it is the only way to fix it from
> the browser.
>
> 1. `{ "name": "BoxAdguard", "props": { "href": "…" } }` becomes
>    `{ "name": "BoxStats", "props": { "provider": "adguard", "href": "…", "secret": "ADGUARD_MAIN" } }`
> 2. The same rename **inside `defaults`**, if you have one. A `defaults` key naming a
>    container that does not exist matches nothing and warns about nothing, so the box
>    silently loses its `span`.
> 3. `ADGUARD_USERNAME` / `ADGUARD_PASSWORD` are **no longer read**. Replace them with
>    `DASHBOARD_SECRET_ADGUARD_MAIN=admin:your-password`.

### Stats providers

A `BoxStats` names its provider with a token, and its credential with the NAME of an
environment variable — never the credential itself, because `config.json` is the file you
copied from a tracked example and a secret in the file format is a secret in someone's
repository. The variable is `DASHBOARD_SECRET_` plus that name, **verbatim**: no
uppercasing and no punctuation folding, so `"secret": "ADGUARD_MAIN"` is read from
`DASHBOARD_SECRET_ADGUARD_MAIN` and a lowercase name reads a lowercase variable. One
variable per instance, so two boxes can have two logins.

| `provider`    | Reads                                                                 | `secret` holds                                |
| ------------- | --------------------------------------------------------------------- | --------------------------------------------- |
| `adguard`     | AdGuard Home: DNS queries, blocked, average delay, top blocked domain | `username:password`                           |
| `pihole-v5`   | Pi-hole 5: DNS queries, blocked, block rate, blocklist domains        | the API token, from Settings → Show API token |
| `pihole-v6`   | Pi-hole 6: the same four readings                                     | the web password, or an application password  |
| `uptime-kuma` | Uptime Kuma: monitors up, monitors down, 24-hour uptime               | nothing — leave `secret` out                  |
| `proxmox`     | Proxmox VE: guests running, guests stopped, CPU and memory use        | an API token (`user@realm!tokenid=secret`)    |
| `open-meteo`  | Open-Meteo: temperature, feels-like, humidity, wind speed, rain       | nothing — leave `secret` out                  |

Three things about that table are worth saying out loud:

- **Pi-hole 5 and Pi-hole 6 are separate tokens, and you have to know which you run.** They
  share no path, no login and no field names, so there is nothing for one token to have
  wrapped — and they take different secrets anyway. There is no auto-detection: it would
  cost a round trip against a host that may be down, for a version you already know.
- **`href` for `uptime-kuma` is the public STATUS PAGE**, `https://kuma.example/status/home`
  — not the Kuma dashboard. The slug is that url's last segment, which is also why the box
  needs no second prop. A status page needs no credential, so leave `secret` out entirely.
- **`proxmox` reads `/api2/json/cluster/resources`, so a standalone node needs no extra
  config — it is a cluster of one.** Create a privilege-separated token (Datacenter →
  Permissions → API Tokens; a read-only role is enough) and paste the whole
  `user@realm!tokenid=secret` string — with or without the `PVEAPIToken=` prefix the docs
  show. Username/password login is deliberately not supported: an API token is revocable
  and can be scoped to read-only, which a login ticket cannot.
- **`href` for `open-meteo` is the whole REQUEST** — coordinates, the `current=` reading
  list and the units, e.g.
  `https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m`.
  Pin the unit system in the query (`&temperature_unit=fahrenheit&wind_speed_unit=ms`):
  nothing is converted afterwards, and the tiles render numbers without units, since the
  server cannot know which ones you chose. No geocoding — you know your coordinates. A
  self-hosted mirror works too; any URL answering the same shape does.
- **These providers are transcribed from vendor documentation, not from a live instance
  behind this code.** Every other behaviour in this README has been reproduced; these
  endpoints have not. If one reports nothing, the server log names the host and the status.

A `secret` may only contain letters, digits and underscores — a shell cannot export
`DASHBOARD_SECRET_ADGUARD-MAIN`, so a name with a dash in it points at a variable that can
never be set. The editor refuses to save one and says which prop is wrong.

**Write `href` out in full — a redirect costs you the read.** Both Pi-hole providers refuse
to follow one, because v5's token is in the query string and v6's session id is in a header
and a followed redirect would hand either to a host you never configured; the box reports the
`301` instead. AdGuard follows, but its credential is an `Authorization` header, which
`fetch` deletes when a redirect crosses an origin — and `http:` → `https:` is a different
origin — so the read arrives unauthenticated and the instance answers `401`. Either way,
point `href` at the scheme, host and port the service actually answers on.

Two degradations, and they are different on purpose:

- **The variable is named but not set** — an absence. The box is skipped, the server logs
  the variable's name once, and nobody is toasted: that is your own setup decision, not a
  failure to put in front of every visitor.
- **The service refuses or does not answer** — a failure. The box says so, a dismissible
  message names the provider and the instance, and the reason (a status, `fetch failed`)
  goes to the server log. Each read is bounded at 3 seconds, so a box that is switched off
  cannot hold the page.

#### Self-signed TLS

Node's `fetch` rejects a self-signed certificate outright and offers no per-request escape
hatch, so a provider behind one cannot be read: install a real certificate, or terminate
TLS at a reverse proxy and point `href` at that. `NODE_TLS_REJECT_UNAUTHORIZED=0` is not
an option — it is process-global and silently unverifies every other request the server
makes. This is the same wall the `tcp` status probe exists to get around, and it is why
TrueNAS, Unifi and Portainer are not stats providers — and why a Proxmox `href` has to
point at a real certificate or a TLS-terminating proxy, exactly like every other provider.

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

## The admin area

`DASHBOARD_ADMIN_TOKEN` is one shared secret for one operator — not a user system. Set it
in `.env` (or the environment `node build` runs in) and `/admin` becomes an editor for the
config the server is serving — a form built from the container schema, not a JSON box:

```sh
DASHBOARD_ADMIN_TOKEN=$(openssl rand -hex 32)
```

- **Unset, the whole admin area returns 404**, not 401: a feature that is switched off
  should not advertise that it exists.
- **Set, the header shows an "Administration" link** beside the theme and language menus,
  so `/admin` does not have to be typed. Signed out it lands on the login form. The
  tradeoff is deliberate: once the token is set, that link tells anyone who can load the
  dashboard that an admin area exists — which is why it is gated on the token rather than
  always present, so switching the feature off still leaves nothing advertising it.
- **Beside it, a pen opens the editor at the page you are on.** It shows only on a page
  `config.json` actually declares, and it scrolls straight to that page's block — so editing
  the box in front of you does not mean scrolling past every other page's containers first.
- **A save is refused outright if the config would drop anything**, and the page names what:
  nothing is written unless every container in it is valid, so a typo cannot cost you a box
  silently. Edits are written atomically and take effect on the next request — no restart.
- **What the form cannot edit, you get as raw JSON instead.** A file with a container the
  schema does not declare, an entry that is not a container, or a `class` prop the config
  format does not allow cannot be repaired through a generated form — so the editor hands you
  the text. Fix it, save, and the form comes back. Adding, removing and renaming **pages**
  still means editing `config.json` directly, as does reordering containers.
- Signing in at `/admin/login` sets a session cookie that is `httpOnly`, `SameSite=Strict`
  and — outside `npm run dev` — `Secure`, so **serve production over TLS** or the browser
  drops it and the login never sticks.
- **Set `ORIGIN` to the address you actually serve on**, e.g.
  `ORIGIN=https://dashboard.example.com node build`. Without it, signing in answers
  **403 Forbidden**: the login is a POST and the server compares its origin against a URL it
  guessed. `ORIGIN` is also what tells the server whether the request was https, which is what
  decides the `Secure` flag on the theme, scenery-seed and motion cookies — unset on a plain-http
  deployment, the server marks them `Secure`, the browser drops the seed and the animated scenery
  rearranges itself on every page load. `http://localhost` and `http://127.0.0.1` are exempt (they
  keep `Secure` cookies), so this shows up on a LAN address like `http://192.168.1.10:3000` and
  never in development. Behind a reverse proxy, `ORIGIN` is the public address, not the internal
  one.
- The cookie holds the token, so **rotating `DASHBOARD_ADMIN_TOKEN` signs everyone out**.
  That is the whole revocation mechanism; there is no session store to clear.
- **`/admin` and everything under it are reserved** once the token is set. A `pages` key
  of `/admin` in `config.json` still renders in the navigation but is no longer reachable —
  the guard answers first — so name that page something else.
- **Five wrong tokens from one address, then a backoff** — 5 seconds, doubling to a minute,
  and a correct token is refused while the wait is running. A successful sign-in clears it.
  The counter is per server process, so a restart forgets it. Behind a reverse proxy that
  does not forward the client address, every request looks like the proxy and the backoff
  becomes global: still a limit, but someone else's guessing can make you wait. That is why
  the wait caps at a minute rather than an hour — pick a token long enough that the limit
  never has to be the thing protecting you, and don't expose the dashboard to the internet.

## Services and status dots

Each `BoxService` is probed through `POST /api/ping` every 15 minutes, and again when the tab
becomes visible or the window regains focus — but only if 15 minutes have passed since the last
probe, so returning to the dashboard does not re-probe anything that was measured recently. A tab
in the background is not probed at all. The probe opens a TCP connection to the `href`'s own host
**and port** — so a dead service on a live host reads as offline, and two boxes on one host can
disagree. A scheme without a port to connect to is rejected. The endpoint only probes `host:port`
pairs that appear in `config.json`; anything else is rejected too.

Because the endpoint is unauthenticated, its frequency is bounded as well: each client address can
ask for up to 300 probes per rolling minute — far more than the dashboard's own polling ever
produces, even under rapid navigation — and past that it answers **429** until its minute drains.
The counter lives in the server process, so a restart resets it, and behind a proxy that hides
client addresses the budget is shared by everyone behind it.

A dot only changes when a probe answers. A probe that **fails** — a network drop, a
proxy erroring — says nothing about the service, so the dot keeps its last known state
and a dismissible message names the service at the bottom of the page instead. An
unreachable `BoxStats` gets one too, naming the provider and the instance — otherwise
that failure is visible only as an empty box, and a page holding two of them cannot say
which. A feed that does not answer gets one as well, naming its URL. Each clears itself
after a few seconds, a failure that repeats does not stack up, and both follow the page
language. The technical detail behind them — `fetch failed`, an HTTP status, the host —
goes to the server's log rather than the screen, so check there when the message is not
enough.

## Languages

Every piece of user-facing text goes through Paraglide. The catalogues live in
[`messages/`](messages) — `en` is the base locale, `de` is translated. Add a key to
both files and use `m.<key>()`; the compiler regenerates `src/lib/paraglide` on every
vite run and typechecks the message parameters.

Add the key to **both** catalogues, though — a missing translation fails nothing. For a
locale lacking a key the compiler emits `const de_<key> = en_<key>;` and succeeds, so the
German page silently renders English.

On a first visit the page is rendered in **the browser's own language**, from the
`Accept-Language` it sends — a German browser gets a German dashboard without touching anything,
and anything other than German falls back to English. Choosing a language from the header
dropdown writes a cookie, and the cookie wins from then on: an explicit choice is never
overridden by the browser preference. Page names come from `config.json` and are shown as
written.

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
  props (`box-service-wrapper`, `box-stats-wrapper`); the component next to it takes the
  same data as a plain prop and is tested directly, so a spec would just duplicate it —
  but only a story can supply the store context and prove the forwarding.
- One e2e file per feature, named after it (`e2e/can-change-theme.e2e.ts`).
  Playwright points the preview server at `e2e/fixture-config.json`, so the suite
  never depends on the services of the machine it runs on: the preview server's own
  port as the reachable service, a host that never resolves, and a stats provider on a
  closed port.
