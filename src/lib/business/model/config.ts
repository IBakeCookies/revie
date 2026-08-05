import { normalizeSpan } from '$lib/utils/style';

/**
 * The dashboard config format.
 *
 * This schema is declared here rather than derived from the components' props, and
 * that is the point: `config.json` is a contract with whoever edits it. Deriving it
 * meant renaming a prop on a component silently changed the file format, with no
 * error anywhere. Now presentation has to satisfy this, and a mismatch is a compile
 * error where the props are handed over (`config-container.svelte`).
 *
 * Business therefore names no component, in values or in types.
 */

export const CONTAINER_NAMES = ['BoxService', 'BoxAdguard', 'BoxDate', 'Grid', 'SubGrid'] as const;

export type ContainerName = (typeof CONTAINER_NAMES)[number];

export function isContainerName(name: string): name is ContainerName {
	return (CONTAINER_NAMES as readonly string[]).includes(name);
}

/** Carried by every container: how many of the twelve grid columns it takes. */
interface CommonProps {
	span?: number;
}

interface GridProps extends CommonProps {
	title?: string;
	subTitle?: string;
	items: Container[];
}

type Container =
	| {
			name: 'BoxService';
			// `title` is required: the box renders it as its heading, so without one it
			// shows an empty line. Declaring it optional here is what let a title-less
			// entry through validation while the component demanded it.
			props: CommonProps & { title: string; href: string; img: { src: string } };
	  }
	| { name: 'BoxAdguard'; props: CommonProps & { href: string } }
	| { name: 'BoxDate'; props: CommonProps }
	| { name: 'Grid'; props: GridProps }
	| { name: 'SubGrid'; props: GridProps };

/**
 * A container as it appears in the config file. Narrowing on `name` narrows the
 * props with it, so `ConfigContainer<'BoxService'>` is the BoxService member alone.
 */
export type ConfigContainer<N extends ContainerName = ContainerName> = Extract<
	Container,
	{ name: N }
>;

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

export const emptyConfig: Config = {
	pages: {},
};

export function isBoxService(item: ConfigContainer): item is ConfigContainer<'BoxService'> {
	return item.name === 'BoxService';
}

export function isGrid(item: ConfigContainer): item is ConfigContainer<'Grid' | 'SubGrid'> {
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
 * What each container cannot render without, returning the name of the first
 * missing prop.
 *
 * A container missing one has to be dropped HERE. The props come from a
 * hand-edited file and are otherwise unchecked, so letting one reach its
 * component throws during SSR and takes the whole page to a 500 — losing every
 * other box on it, for one typo in one entry.
 *
 * Keyed by `ContainerName`, so adding a container to the schema without deciding
 * what it requires is a compile error rather than a gap.
 */
const requiredProps: Record<ContainerName, (props: Record<string, unknown>) => string | undefined> =
	{
		BoxService: (props) => {
			if (typeof props.title !== 'string') return 'title';

			if (typeof props.href !== 'string') return 'href';

			if (!isRecord(props.img) || typeof props.img.src !== 'string') return 'img.src';

			return undefined;
		},
		BoxAdguard: (props) => (typeof props.href !== 'string' ? 'href' : undefined),
		BoxDate: () => undefined,
		// Grid and SubGrid need `items`, but it is defaulted below rather than
		// required, so a grid written before its children still renders as empty.
		Grid: () => undefined,
		SubGrid: () => undefined,
	};

const CONTAINS_CHILDREN: ContainerName[] = ['Grid', 'SubGrid'];

function normalizeContainer(
	raw: unknown,
	defaults: Record<string, unknown>,
): ConfigContainer | undefined {
	if (!isRecord(raw) || typeof raw.name !== 'string') {
		console.warn('Skipping a container without a name');

		return undefined;
	}

	if (!isContainerName(raw.name)) {
		console.warn(`Skipping container "${raw.name}", no such container exists`);

		return undefined;
	}

	const defaultProps = defaults[raw.name];

	const props: Record<string, unknown> = {
		...(isRecord(defaultProps) ? defaultProps : undefined),
		...(isRecord(raw.props) ? raw.props : undefined),
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
	// and only the name validated above says which container they belong to. The
	// guard above is what makes it safe rather than hopeful.
	return {
		name: raw.name,
		props,
	} as ConfigContainer;
}

/**
 * Turns the parsed config file into containers that are safe to render: unknown
 * containers and malformed entries are dropped, per-container defaults are merged
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

		// A page key is a URL path and the navigation links straight to it, so one
		// without the leading slash emits a RELATIVE href: `noslash` visited from
		// /services resolves to /noslash under it and 404s. Dropped rather than warned
		// about, because a link that navigates somewhere else is worse than no link.
		if (!path.startsWith('/')) {
			console.warn(`Skipping page "${path}", a page path has to start with "/"`);

			continue;
		}

		pages[path] = {
			name: typeof rawPage.name === 'string' ? rawPage.name : undefined,
			containers: (Array.isArray(rawPage.containers) ? rawPage.containers : [])
				.map((container) => normalizeContainer(container, defaults))
				.filter((item): item is ConfigContainer => item !== undefined),
		};
	}

	return {
		pages,
	};
}

function scanContainer(item: ConfigContainer, target: ContainerName): ConfigContainer | undefined {
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
	target: ContainerName,
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
