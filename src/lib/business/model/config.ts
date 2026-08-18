import * as v from 'valibot';
import { normalizeSpan } from '$lib/utils/style';

/**
 * The dashboard config format, declared once as a runtime schema with every type
 * below inferred from it — a second, hand-written copy of these shapes is what the
 * old `requiredProps` table was, and nothing forced the two to agree.
 *
 * The schema is declared here rather than derived from the components' props, and
 * that is the point: `config.json` is a contract with whoever edits it. Deriving it
 * meant renaming a prop on a component silently changed the file format, with no
 * error anywhere. Now presentation has to satisfy this, and a mismatch is a compile
 * error where the props are handed over (`config-container.svelte`).
 *
 * Business therefore names no component, in values or in types.
 */

/** Carried by every container: how many of the twelve grid columns it takes. */
const spanProp = v.optional(v.number());
/**
 * How a service's state is measured, chosen per box because no single probe is right
 * for every entry a config names.
 *
 * `tcp` is the default and the right answer for a LAN service: Proxmox, TrueNAS, Unifi
 * and Portainer all ship self-signed certificates that Node's `fetch` rejects outright,
 * and several of them answer 401 or 302 at `/` while being perfectly up — so an HTTP
 * probe would call a healthy box offline. A connect to `host:port` avoids both.
 *
 * `http` is for a host that says nothing useful on its own: a page on a shared origin
 * like GitHub Pages always accepts a connection, so the connect is a constant and the
 * PATH is the actual question. It is opt-in because it inherits the two failures above.
 *
 * `none` is a link with nothing to measure — a bookmark. It draws no dot, is never
 * polled, and never enters `/api/ping`'s allowlist.
 */
const probeModes = ['tcp', 'http', 'none'] as const;

export type ProbeMode = (typeof probeModes)[number];

/**
 * Which service a stats box reads. A token rather than a container per vendor: a dozen
 * names is a dozen schema entries, a dozen branches before `config-container.svelte`'s
 * `never` assert and a dozen components, while a token keeps presentation at one
 * component and moves completeness to `Record<ProviderName, …>` in
 * `business/model/stats.ts` — the same guarantee, one layer down.
 *
 * It lives HERE and not in `stats.ts`, and that is not arbitrary: this file is in the
 * client bundle (`poll-services-state.ts` value-imports `collectServiceProbes`) while
 * `stats.ts` value-imports every repository. `stats.ts` imports this type and never the
 * reverse, so there is no runtime edge and no cycle.
 *
 * Pi-hole is TWO tokens rather than one with a version prop: v5 and v6 share no path, no
 * auth and no field names, so a single token would be one branch wrapping two unrelated
 * bodies — and the operator has to know which they run either way, because the two take
 * different secrets. Auto-detection was refused for the same reason it is refused in
 * `roadmap.md` #33: a round trip per cache miss, against a host that may be down, for a
 * version the operator already knows.
 */
export const providerNames = ['adguard', 'pihole-v5', 'pihole-v6', 'uptime-kuma'] as const;

export type ProviderName = (typeof providerNames)[number];

/**
 * A Grid's children are `unknown` in the schema and containers in the type. A
 * container schema cannot name itself — that is a cycle TypeScript refuses to infer
 * through — and it should not: children are validated one at a time by recursing
 * through `normalizeContainer`, which is what lets one bad child be dropped without
 * failing its parent. A single parse could only fail the whole grid.
 */
const gridProps = {
	span: spanProp,
	title: v.optional(v.string()),
	subTitle: v.optional(v.string()),
	items: v.array(v.unknown()),
};

type WithChildren<P> = P extends { items: unknown[] }
	? Omit<P, 'items'> & { items: ConfigContainer[] }
	: P;

/**
 * What each container may carry, and what it cannot render without.
 *
 * A container missing a required prop has to be dropped. The props come from a
 * hand-edited file and are otherwise unchecked, so letting one reach its component
 * throws during SSR and takes the whole page to a 500 — losing every other box on
 * it, for one typo in one entry.
 */
const containerSchemas = {
	// `title` is required: the box renders it as its heading, so without one it
	// shows an empty line. Declaring it optional is what let a title-less entry
	// through validation while the component demanded it.
	BoxService: v.object({
		span: spanProp,
		title: v.string(),
		href: v.string(),
		// Deliberately no default, unlike `img` below: a default would make the walk
		// describe it as required (an `optional` WITH one keeps what is under it
		// required), so the editor would mark a prop nobody has to write. The two
		// readers default to `tcp` instead, the same way `span` and `headingLevel` do.
		probe: v.optional(v.picklist(probeModes)),
		// The default is deliberately not a valid `img`: it walks a missing `img` one
		// level further into the parse, so the warning names `img.src` — the prop an
		// operator has to write — instead of stopping at `img`. It never reaches the
		// output, because a container that fails to parse is dropped.
		img: v.optional(
			v.object({
				src: v.string(),
			}),
			{} as { src: string },
		),
	}),
	BoxStats: v.object({
		span: spanProp,
		provider: v.picklist(providerNames),
		/** Where this instance lives, and what the box links to. */
		href: v.string(),
		/**
		 * The NAME of the environment variable holding this instance's credential —
		 * `"ADGUARD_MAIN"` is read from `DASHBOARD_SECRET_ADGUARD_MAIN` — never the
		 * credential itself: `config.example.json` is tracked, so a secret in the file
		 * format is a secret in someone's repository. One variable per instance, so two
		 * instances of one provider can have two logins.
		 *
		 * Optional, and deliberately WITHOUT a default: an optional with one keeps what is
		 * under it required, which would mark a prop nobody has to write.
		 *
		 * The pattern is what a shell can export. Without it, `"ADGUARD-MAIN"` names a
		 * variable that can never be set and the log names it forever; with it, the editor
		 * refuses the save and says which prop is wrong.
		 */
		secret: v.optional(v.pipe(v.string(), v.regex(/^[A-Za-z0-9_]+$/))),
	}),
	BoxDate: v.object({
		span: spanProp,
	}),
	BoxSearch: v.object({
		span: spanProp,
		/**
		 * Where the query goes: the form's `action`. A GET submission REPLACES the query
		 * string, so an href carrying one loses it — spell engine options in the path.
		 */
		href: v.string(),
		placeholder: v.optional(v.string()),
	}),
	// Grid and SubGrid do not require `items`: it is defaulted below, so a grid
	// written before its children still renders as empty.
	Grid: v.object(gridProps),
	SubGrid: v.object(gridProps),
};

export type ContainerName = keyof typeof containerSchemas;

export function isContainerName(name: string): name is ContainerName {
	return Object.hasOwn(containerSchemas, name);
}

/** Every name a config may use, in the order the schema declares them. */
export const containerNames = Object.keys(containerSchemas) as ContainerName[];

/**
 * One editable prop, as an editor needs to see it.
 *
 * The schema is a runtime value, so a form is generated from it rather than restating
 * it — which is what keeps a new container from needing a third edit point beside
 * `containerSchemas` and `config-container.svelte`. This describes the fields as plain
 * data on purpose: valibot's internals stop here, and presentation only ever reads a
 * path, a kind and a flag.
 */
export type ContainerField = {
	/** Dot path into the container's props — `img.src` for a nested object. */
	path: string;
	/** `children` is a nested container list, which an editor renders recursively. */
	kind: 'string' | 'number' | 'enum' | 'children';
	/** Leaving it out is a parse failure, so the container would be dropped. */
	isRequired: boolean;
	/**
	 * Every value the schema accepts, set only where it names them — an `enum`. An editor
	 * has to offer these rather than a text box: text is the one kind a free-form field
	 * can always satisfy, and an enum is the first prop where a typo is a refused save
	 * instead of a saved mistake.
	 */
	options?: readonly string[];
};

/**
 * As much of valibot's runtime shape as the walk below reads. The schemas are typed
 * values, but `GenericSchema` exposes neither `entries` nor `wrapped`, so the walk
 * needs the structural view — assigned once here rather than asserted per access.
 */
type SchemaNode = {
	type: string;
	default?: unknown;
	wrapped?: SchemaNode;
	entries?: Record<string, SchemaNode>;
	/** A picklist's accepted values. `undefined` on every other node, which is the test. */
	options?: readonly string[];
};

const schemaNodes: Record<ContainerName, SchemaNode> = containerSchemas;

/**
 * Anything that is not a number or a nested list is offered as text. A prop whose type
 * text cannot express is then refused on save with a diagnostic naming it, where
 * dropping it from the list would leave it unreachable from the editor with nothing said.
 */
function fieldKind(type: string): ContainerField['kind'] {
	if (type === 'array') {
		return 'children';
	}

	if (type === 'number') {
		return 'number';
	}

	if (type === 'picklist') {
		return 'enum';
	}

	return 'string';
}

function describeFields(
	entries: Record<string, SchemaNode>,
	prefix: string,
	isRequired: boolean,
): ContainerField[] {
	const fields: ContainerField[] = [];

	for (const [key, entry] of Object.entries(entries)) {
		const path = `${prefix}${key}`;
		// An optional with no default may be left out entirely. One WITH a default has it
		// substituted and then parsed, so what is under it stays required — which is how
		// `BoxService.img`'s deliberately invalid `{}` default makes `img.src` required.
		const isOmittable = entry.type === 'optional' && entry.default === undefined;
		const node = entry.wrapped ?? entry;
		const required = isRequired && !isOmittable;

		if (node.entries) {
			fields.push(...describeFields(node.entries, `${path}.`, required));

			continue;
		}

		fields.push({
			path,
			kind: fieldKind(node.type),
			isRequired: required,
			// `undefined` for every kind but `enum`: only a picklist carries them.
			options: node.options,
		});
	}

	return fields;
}

/** What each container carries, walked out of its schema once at module load. */
export const containerFields = Object.fromEntries(
	containerNames.map((name) => [name, describeFields(schemaNodes[name].entries ?? {}, '', true)]),
) as Record<ContainerName, ContainerField[]>;

/**
 * A container as it appears in the config file. Narrowing on `name` narrows the
 * props with it, so `ConfigContainer<'BoxService'>` is the BoxService member alone.
 */
export type ConfigContainer<N extends ContainerName = ContainerName> = {
	[K in ContainerName]: {
		name: K;
		props: WithChildren<v.InferOutput<(typeof containerSchemas)[K]>>;
	};
}[N];

/**
 * A page as it appears in the FILE: `containers` is only checked for being an
 * array, because each entry is normalized one at a time below so that a bad one
 * does not take its siblings. A schema claiming they are containers would be a
 * guarantee nothing here checks.
 */
const pageSchema = v.object({
	name: v.fallback(v.optional(v.string()), undefined),
	containers: v.fallback(v.array(v.unknown()), []),
});

/** The NORMALIZED page: same shape, with the containers actually validated. */
export type ConfigPage = Omit<v.InferOutput<typeof pageSchema>, 'containers'> & {
	containers: ConfigContainer[];
};

/**
 * The NORMALIZED config, which is not the shape of the file.
 *
 * The file also carries a `defaults` object, but it is consumed during
 * normalization — merged into each container's props — so nothing downstream ever
 * sees it. That is why there is no `defaults` field here, and why the file format
 * has a schema of its own below: it arrives as `unknown` and only `normalizeConfig`
 * reads it.
 */
export type Config = {
	pages: Record<string, ConfigPage>;
};

/**
 * The file as it arrives. Everything below the two keys stays `unknown` and is
 * normalized entry by entry, because one malformed page must not cost the rest of
 * the dashboard; the fallbacks are what let a file missing either key parse at all.
 */
const fileSchema = v.object({
	defaults: v.fallback(v.record(v.string(), v.unknown()), {}),
	pages: v.fallback(v.record(v.string(), v.unknown()), {}),
});

export const emptyConfig: Config = {
	pages: {},
};

export function isBoxService(item: ConfigContainer): item is ConfigContainer<'BoxService'> {
	return item.name === 'BoxService';
}

export function isGrid(item: ConfigContainer): item is ConfigContainer<'Grid' | 'SubGrid'> {
	return item.name === 'Grid' || item.name === 'SubGrid';
}

export function isBoxStats(item: ConfigContainer): item is ConfigContainer<'BoxStats'> {
	return item.name === 'BoxStats';
}

/**
 * Class names are not part of the config surface. Tailwind is a build-time
 * compiler, so a class that only appears in runtime config produces no CSS and
 * would silently do nothing. Column width is configured with `span` instead.
 */
const STYLE_KEYS = ['class', 'gridClass'] as const;
/**
 * `defaults` carries per-container props, and children are not a prop. A default
 * `items` is re-supplied to every child it produces, and each of those inherits it
 * again — the recursion never bottoms out and the stack goes, taking every request
 * with it. No schema can catch it: the merge happens before the parse.
 */
const STRUCTURAL_KEYS = ['items'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CONTAINS_CHILDREN: ContainerName[] = ['Grid', 'SubGrid'];

function normalizeContainer(
	raw: unknown,
	defaults: Record<string, unknown>,
	warnings: string[],
): ConfigContainer | undefined {
	if (!isRecord(raw) || typeof raw.name !== 'string') {
		warnings.push('Skipping a container without a name');

		return undefined;
	}

	if (!isContainerName(raw.name)) {
		warnings.push(`Skipping container "${raw.name}", no such container exists`);

		return undefined;
	}

	const defaultProps = defaults[raw.name];

	const props: Record<string, unknown> = {
		...(isRecord(defaultProps) ? defaultProps : undefined),
		...(isRecord(raw.props) ? raw.props : undefined),
	};

	for (const key of STYLE_KEYS) {
		if (props[key] !== undefined) {
			warnings.push(`Ignoring "${key}" on container "${raw.name}", use "span" instead`);

			delete props[key];
		}
	}

	if (props.span !== undefined) {
		const span = normalizeSpan(props.span);

		// As loud as the `class` case above: a rejected span (`"6"`, `1.5`) falls back
		// to the full twelve columns, so a silent drop renders a full-width box and
		// looks like a layout bug rather than the typo it is.
		if (span === undefined) {
			warnings.push(`Ignoring "span" on container "${raw.name}", it has to be a whole number`);
		}

		props.span = span;
	}

	// Set unconditionally, not just when present: every traversal (collectStatsTargets,
	// collectServiceProbes) iterates `items`, so a grid whose children have not been
	// written yet would throw on the first page load rather than render as empty.
	if (CONTAINS_CHILDREN.includes(raw.name)) {
		props.items = (Array.isArray(props.items) ? props.items : [])
			.map((child) => normalizeContainer(child, defaults, warnings))
			.filter((item): item is ConfigContainer => item !== undefined);
	}

	// Never `parse`: a hand-edited file has to degrade, so the failure comes back as a
	// value and only this container is dropped. The sentence is ours rather than
	// valibot's — it is the operator log channel, and the first issue names the prop.
	const parsed = v.safeParse(containerSchemas[raw.name], props);

	if (!parsed.success) {
		const missing = v.getDotPath(parsed.issues[0]);

		// "not a string" until `probe` arrived, which is the first prop where a value CAN be
		// a string and still be rejected — an enum names what it accepts. The sentence has
		// to cover both, and it is the operator's only account of why a box vanished.
		warnings.push(`Skipping container "${raw.name}", "${missing}" is missing or not valid`);

		return undefined;
	}

	// The one unavoidable assertion in the whole pipeline. `props` is returned rather
	// than the parse output because `v.object` strips what it does not name, and only
	// the name checked above says which container these props belong to.
	return {
		name: raw.name,
		props,
	} as ConfigContainer;
}

function withoutStructuralDefaults(
	defaults: Record<string, unknown>,
	warnings: string[],
): Record<string, unknown> {
	const cleaned: Record<string, unknown> = {};

	for (const [name, props] of Object.entries(defaults)) {
		// The merge only ever reads `defaults[raw.name]` for a name the schema knows, so a
		// typo'd key is never looked up and the operator's defaults simply never apply — with
		// nothing anywhere to say so.
		if (!isContainerName(name)) {
			warnings.push(`Ignoring the defaults for "${name}", no such container exists`);

			continue;
		}

		if (!isRecord(props)) {
			warnings.push(`Ignoring the defaults for "${name}", it is not a set of props`);

			continue;
		}

		const kept = {
			...props,
		};

		for (const key of STRUCTURAL_KEYS) {
			if (kept[key] !== undefined) {
				warnings.push(`Ignoring "${key}" in the defaults for "${name}", it is not a prop`);

				delete kept[key];
			}
		}

		cleaned[name] = kept;
	}

	return cleaned;
}

/**
 * Turns the parsed config file into containers that are safe to render: unknown
 * containers and malformed entries are dropped, per-container defaults are merged
 * in, and spans are clamped. The file is hand-edited and read at runtime, so a bad
 * entry has to degrade instead of taking down every render.
 *
 * Every drop is RETURNED rather than printed: this is a framework-free model, so
 * what a diagnostic is worth belongs to whoever called it. The sentences are the
 * operator log channel — English on purpose, and never for a user's eye.
 */
export function normalizeConfig(raw: unknown): { config: Config; warnings: string[] } {
	const warnings: string[] = [];
	const file = v.safeParse(fileSchema, raw);

	if (!file.success) {
		return {
			config: emptyConfig,
			warnings,
		};
	}

	// At the root rather than inside `normalizeContainer`, so one offending `defaults` entry
	// is reported once instead of once per container instance on the page.
	const defaults = withoutStructuralDefaults(file.output.defaults, warnings);
	const pages: Config['pages'] = {};

	for (const [path, rawPage] of Object.entries(file.output.pages)) {
		// `v.object` accepts an array, and an array is not a page: it would parse as one
		// with no containers, and the navigation links straight to every key it gets —
		// a dead nav entry, which is the defect the leading-slash check below guards.
		if (!isRecord(rawPage)) {
			continue;
		}

		const page = v.safeParse(pageSchema, rawPage);

		if (!page.success) {
			continue;
		}

		// A page key is a URL path and the navigation links straight to it, so one
		// without the leading slash emits a RELATIVE href: `noslash` visited from
		// /services resolves to /noslash under it and 404s. Dropped rather than warned
		// about, because a link that navigates somewhere else is worse than no link.
		if (!path.startsWith('/')) {
			warnings.push(`Skipping page "${path}", a page path has to start with "/"`);

			continue;
		}

		pages[path] = {
			name: page.output.name,
			containers: page.output.containers
				.map((child) => normalizeContainer(child, defaults, warnings))
				.filter((item): item is ConfigContainer => item !== undefined),
		};
	}

	return {
		config: {
			pages,
		},
		warnings,
	};
}

/**
 * How a reading is addressed everywhere downstream: the TTL cache, the page's record and
 * the store all use this one string, so they cannot disagree about what a box asked for.
 *
 * The provider is in it because an href alone is not an identity. Two boxes at one href
 * with different providers is a real config — a Pi-hole being migrated from v5 to v6
 * answers both — and an href-keyed cache would then serve one provider's readings to the
 * other: not a collision, wrong numbers. `readStats` cannot tell them apart on its own.
 */
export function statsKey(provider: ProviderName, href: string): string {
	return `${provider} ${href}`;
}

/** One stats box, as a reader needs to see it. */
export type StatsTarget = {
	key: string;
	provider: ProviderName;
	href: string;
	/** The NAME of the variable holding the credential, as the config wrote it. */
	secret?: string;
};

function collectTargets(items: ConfigContainer[], into: Map<string, StatsTarget>): void {
	for (const item of items) {
		if (isGrid(item)) {
			collectTargets(item.props.items, into);

			continue;
		}

		if (!isBoxStats(item)) {
			continue;
		}

		const key = statsKey(item.props.provider, item.props.href);

		if (!into.has(key)) {
			into.set(key, {
				key,
				provider: item.props.provider,
				href: item.props.href,
				secret: item.props.secret,
			});
		}
	}
}

/**
 * Every stats instance on a page, at any nesting depth, each key once.
 *
 * Deduped for the same reason `collectServiceProbes` is: the caller reads what it gets
 * back, so two boxes naming one instance would fetch it twice per page load and both
 * render the later answer anyway. First occurrence wins — two boxes naming one target
 * with two `secret`s is a config to fix, not a case worth arbitrating.
 */
export function collectStatsTargets(containers: ConfigContainer[]): StatsTarget[] {
	const targets = new Map<string, StatsTarget>();

	collectTargets(containers, targets);

	return [...targets.values()];
}

/** A service that is meant to be measured, and how. `none` never reaches this shape. */
export type ServiceProbe = {
	href: string;
	probe: Exclude<ProbeMode, 'none'>;
};

function collectProbes(items: ConfigContainer[], into: Map<string, ServiceProbe['probe']>): void {
	for (const item of items) {
		if (isGrid(item)) {
			collectProbes(item.props.items, into);

			continue;
		}

		if (!isBoxService(item)) {
			continue;
		}

		const mode = item.props.probe ?? 'tcp';

		if (mode !== 'none' && !into.has(item.props.href)) {
			into.set(item.props.href, mode);
		}
	}
}

/**
 * Every service on a page that is meant to be probed, at any nesting depth, each href
 * once, carrying the mode config chose for it.
 *
 * `probe: 'none'` is EXCLUDED rather than reported, and that is the whole point of the
 * mode: both callers are consequences of appearing here. The poll would measure a link
 * that has nothing to measure, and `/api/ping`'s allowlist would put its host among the
 * endpoints an unauthenticated POST can reach — so a bookmark is left out of the list
 * rather than filtered by each caller in turn.
 *
 * Deduped because the caller probes what it gets back on a timer: the same href in two
 * boxes would be probed twice per tick, doubling the requests and the window for two
 * answers to land out of order. The first PROBED occurrence wins the mode — two boxes
 * naming one href with two modes is a config to fix, not a case worth arbitrating.
 */
export function collectServiceProbes(containers: ConfigContainer[]): ServiceProbe[] {
	const probes = new Map<string, ServiceProbe['probe']>();

	collectProbes(containers, probes);

	return [...probes].map(([href, probe]) => ({
		href,
		probe,
	}));
}
