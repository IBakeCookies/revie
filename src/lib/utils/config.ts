import type { ComponentProps } from 'svelte';
import type { ComponentRegistry, ComponentName } from '$lib/utils/component-registry';
import { isComponentName } from '$lib/utils/component-registry';
import { normalizeSpan } from '$lib/utils/style';

/**
 * A container as it appears in the config file: the name of a component plus its
 * props. Distributing over the component names keeps `name` and `props` correlated,
 * so narrowing on the name narrows the props with it.
 */
export type ConfigContainer<N extends ComponentName = ComponentName> = {
	[K in N]: {
		name: K;
		props: ComponentProps<ComponentRegistry[K]>;
	};
}[N];

export type ConfigPage = {
	name?: string;
	containers: ConfigContainer[];
};

/**
 * The NORMALIZED config, which is not the shape of the file.
 *
 * The file also carries a `defaults` object, but it is consumed during
 * normalization — merged into each container's props — so nothing downstream ever
 * sees it. That is why there is no `defaults` field here, and why the file format
 * itself has no type: it arrives as `unknown` and only `normalizeConfig` reads it.
 */
export type Config = {
	pages: {
		[path: string]: ConfigPage;
	};
};

export const emptyConfig: Config = { pages: {} };

export function isBoxService(item: ConfigContainer): item is ConfigContainer<'BoxService'> {
	return item.name === 'BoxService';
}

export function isGrid(
	item: ConfigContainer
): item is ConfigContainer<'Grid'> | ConfigContainer<'SubGrid'> {
	return item.name === 'Grid' || item.name === 'SubGrid';
}

export function isBoxAdguard(item: ConfigContainer): item is ConfigContainer<'BoxAdguard'> {
	return item.name === 'BoxAdguard';
}

/**
 * Class names are not part of the config surface. Tailwind is a build-time
 * compiler, so a class that only appears in runtime config produces no CSS and
 * would silently do nothing. Column width is configured with `span` instead.
 */
const STYLE_KEYS = ['class', 'gridClass'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * What each component cannot render without, returning the name of the first
 * missing prop.
 *
 * A container missing one has to be dropped HERE. The props come from a
 * hand-edited file and are otherwise unchecked, so letting one reach its
 * component throws during SSR and takes the whole page to a 500 — losing every
 * other box on it, for one typo in one entry.
 *
 * Keyed by `ComponentName`, so registering a component without deciding what it
 * requires is a compile error rather than a gap.
 */
const requiredProps: Record<ComponentName, (props: Record<string, unknown>) => string | undefined> =
	{
		BoxService: (props) => {
			if (typeof props.href !== 'string') return 'href';
			if (!isRecord(props.img) || typeof props.img.src !== 'string') return 'img.src';

			return undefined;
		},
		BoxAdguard: (props) => (typeof props.href !== 'string' ? 'href' : undefined),
		BoxDate: () => undefined,
		// Grid and SubGrid need `items`, but it is defaulted below rather than
		// required, so a grid written before its children still renders as empty.
		Grid: () => undefined,
		SubGrid: () => undefined
	};

const CONTAINS_CHILDREN: ComponentName[] = ['Grid', 'SubGrid'];

function normalizeContainer(
	raw: unknown,
	defaults: Record<string, unknown>
): ConfigContainer | undefined {
	if (!isRecord(raw) || typeof raw.name !== 'string') {
		console.warn('Skipping a container without a component name');

		return undefined;
	}

	if (!isComponentName(raw.name)) {
		console.warn(`Skipping container "${raw.name}", no such component is registered`);

		return undefined;
	}

	const defaultProps = defaults[raw.name];

	const props: Record<string, unknown> = {
		...(isRecord(defaultProps) ? defaultProps : undefined),
		...(isRecord(raw.props) ? raw.props : undefined)
	};

	for (const key of STYLE_KEYS) {
		if (props[key] !== undefined) {
			console.warn(`Ignoring "${key}" on container "${raw.name}", use "span" instead`);

			delete props[key];
		}
	}

	if (props.span !== undefined) {
		props.span = normalizeSpan(props.span);
	}

	// Set unconditionally, not just when present: every traversal (findContainer,
	// collectServiceHrefs) iterates `items`, so a grid whose children have not been
	// written yet would throw on the first page load rather than render as empty.
	if (CONTAINS_CHILDREN.includes(raw.name)) {
		props.items = (Array.isArray(props.items) ? props.items : [])
			.map((child) => normalizeContainer(child, defaults))
			.filter((item): item is ConfigContainer => item !== undefined);
	}

	const missing = requiredProps[raw.name](props);

	if (missing) {
		console.warn(`Skipping container "${raw.name}", "${missing}" is missing or not a string`);

		return undefined;
	}

	// The one unavoidable assertion in the whole pipeline: the props come from JSON,
	// and only the name validated above says which component they belong to. The
	// guard above is what makes it safe rather than hopeful.
	return { name: raw.name, props } as ConfigContainer;
}

/**
 * Turns the parsed config file into containers that are safe to render: unknown
 * components and malformed entries are dropped, per-component defaults are merged
 * in, and spans are clamped. The file is hand-edited and read at runtime, so a bad
 * entry has to degrade instead of taking down every render.
 */
export function normalizeConfig(raw: unknown): Config {
	if (!isRecord(raw)) {
		return emptyConfig;
	}

	const defaults = isRecord(raw.defaults) ? raw.defaults : {};
	const pages: Config['pages'] = {};
	const rawPages = isRecord(raw.pages) ? raw.pages : {};

	for (const [path, rawPage] of Object.entries(rawPages)) {
		if (!isRecord(rawPage)) {
			continue;
		}

		pages[path] = {
			name: typeof rawPage.name === 'string' ? rawPage.name : undefined,
			containers: (Array.isArray(rawPage.containers) ? rawPage.containers : [])
				.map((container) => normalizeContainer(container, defaults))
				.filter((item): item is ConfigContainer => item !== undefined)
		};
	}

	return { pages };
}

function scanContainer(item: ConfigContainer, target: ComponentName): ConfigContainer | undefined {
	if (item.name === target) {
		return item;
	}

	if (!isGrid(item)) {
		return undefined;
	}

	for (const child of item.props.items) {
		const found = scanContainer(child, target);

		if (found) {
			return found;
		}
	}
}

/** First container with the given name, at any nesting depth. */
export function findContainer(
	page: ConfigPage,
	target: ComponentName
): ConfigContainer | undefined {
	for (const container of page.containers) {
		const found = scanContainer(container, target);

		if (found) {
			return found;
		}
	}
}

/** Every service href on a page, at any nesting depth. */
export function collectServiceHrefs(containers: ConfigContainer[]): string[] {
	const hrefs: string[] = [];

	for (const item of containers) {
		if (isBoxService(item)) {
			hrefs.push(item.props.href);
		}

		if (isGrid(item)) {
			hrefs.push(...collectServiceHrefs(item.props.items));
		}
	}

	return hrefs;
}
