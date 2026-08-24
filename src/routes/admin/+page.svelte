<script lang="ts">
	import type { PageProps } from './$types';
	import type { ContainerField } from '$lib/business/model/config';
	import { m } from '$lib/paraglide/messages';

	let { data, form }: PageProps = $props();

	/**
	 * Every container the schema declares, with the fields to render for it — walked out of
	 * `containerSchemas` in business and handed here by the load, because a read ends at a
	 * store or at props and never at a model. Entries rather than a lookup by name: it is
	 * both lists at once, and the file may carry a name the schema no longer declares.
	 */
	const containerTypes = $derived(Object.entries(data.containerFields));

	const fieldsOf = (name: string): ContainerField[] =>
		containerTypes.find(([declared]) => declared === name)?.[1] ?? [];

	const isDeclared = (name: string): boolean =>
		containerTypes.some(([declared]) => declared === name);

	// A rejected submission comes back with the text that was refused, so the operator
	// keeps their edit; otherwise the editor shows the file as it is on disk. Read once and
	// through a function: a POST to a form action is a full page load, so this component is
	// rebuilt per attempt — and svelte warns about a bare top-level read of a prop.
	function source(): string {
		return form && 'text' in form ? (form.text ?? '') : data.text;
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function parseDraft(text: string): Record<string, unknown> | undefined {
		try {
			const parsed: unknown = JSON.parse(text);

			return isRecord(parsed) ? parsed : undefined;
		} catch {
			return undefined;
		}
	}

	/**
	 * The WHOLE parsed file, mutated in place — and that is what makes a round trip safe.
	 * `defaults`, the page names, a prop the schema does not name and a container the form
	 * cannot render are all still in this object; the form reads none of them and writes
	 * none of them, so they go back out as they came in. What a round trip does NOT keep
	 * is the file's own whitespace: it is re-serialized with tabs.
	 *
	 * Undefined when the file is not a JSON object — in which case the load has already set
	 * `needsRawEditor` and the raw editor is what renders, so the guard on it below is for
	 * the type rather than for a state the form is ever seen in.
	 */
	const draft = $state(parseDraft(source()));

	// What the save action receives, so the write still goes through `writeConfig` and its
	// four rejection kinds — the form validates nothing the server does not.
	const serialized = $derived(
		draft ? `${JSON.stringify($state.snapshot(draft), null, '\t')}\n` : '',
	);

	const pages = $derived(
		isRecord(draft?.pages)
			? Object.entries(draft.pages).filter((entry): entry is [string, Record<string, unknown>] =>
					isRecord(entry[1]),
				)
			: [],
	);

	/** Render-only: it creates nothing, because mutating state during render is an error. */
	function listOf(parent: Record<string, unknown>, key: string): unknown[] {
		const list = parent[key];

		return Array.isArray(list) ? list : [];
	}

	/**
	 * The record at `parent[key]`, created when there is none — and read BACK out of the
	 * parent rather than handed back as created. `$state` wraps an assigned object in a
	 * proxy of its own, so writing through the reference that went in mutates the raw
	 * target behind that proxy, where neither the render nor the payload will find it.
	 */
	function record(parent: Record<string, unknown>, key: string): Record<string, unknown> {
		if (!isRecord(parent[key])) {
			parent[key] = {};
		}

		const created = parent[key];

		return isRecord(created) ? created : {};
	}

	function propsOf(container: Record<string, unknown>): Record<string, unknown> {
		return isRecord(container.props) ? container.props : {};
	}

	function readField(container: Record<string, unknown>, path: string): string {
		const value = path
			.split('.')
			.reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), container.props);

		return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
	}

	/**
	 * What an insertion button names as the list it appends to: the page path, then
	 * each owning container named by the `title` or `subTitle` its schema declares,
	 * falling back to its type and the slot it occupies. Two same-type siblings have
	 * to name differently, and position cannot do it — it counts within each list,
	 * and every list starts at 1. Takes `unknown`: the button before an entry the
	 * form cannot render still names the slot that entry occupies.
	 */
	function listTarget(parent: string, container: unknown, index: number): string {
		const node = isRecord(container) ? container : {};

		const label =
			readField(node, 'title') ||
			readField(node, 'subTitle') ||
			`${typeof node.name === 'string' ? node.name : ''} ${index + 1}`;

		return `${parent} · ${label}`;
	}

	/**
	 * An empty field DELETES the key instead of writing `""`. That is what makes a required
	 * prop left blank reach `normalizeConfig` as the absence it is, so the save is refused
	 * with the diagnostic naming it — rather than being written as a box with no href.
	 */
	function writeField(
		container: Record<string, unknown>,
		field: ContainerField,
		value: string,
	): void {
		const keys = field.path.split('.');
		let node = record(container, 'props');

		for (const key of keys.slice(0, -1)) {
			node = record(node, key);
		}

		const last = keys[keys.length - 1];

		if (value === '') {
			delete node[last];

			return;
		}

		node[last] = field.kind === 'number' ? Number(value) : value;
	}

	/**
	 * Inserts at `index`, so every position in a list is reachable and not only the end —
	 * an append-only form cannot put a box before an existing one at all.
	 *
	 * A whole-value assignment rather than a splice, for the reason `record` above gives: a
	 * list the form has just created is a fresh proxy, and writing into the array that went
	 * into it leaves the new container invisible to the render AND to the payload.
	 */
	function addContainer(parent: Record<string, unknown>, key: string, index: number): void {
		const list = parent[key];
		const existing = Array.isArray(list) ? list : [];

		parent[key] = [
			...existing.slice(0, index),
			// The first declared name, and the type select picks from there: one generated
			// list of containers rather than a second one on the button.
			{
				name: containerTypes[0][0],
				props: {},
			},
			...existing.slice(index),
		];
	}

	/**
	 * Moves the container at `index` within its list by `delta` (-1 up, 1 down).
	 * Adjacent by construction, so this is a swap of the pair around `lo` — and the
	 * same whole-value assignment as `addContainer`, for the same reason.
	 */
	function moveContainer(
		parent: Record<string, unknown>,
		key: string,
		index: number,
		delta: -1 | 1,
	): void {
		const list = parent[key];
		const target = index + delta;

		if (!Array.isArray(list) || target < 0 || target >= list.length) {
			return;
		}

		const lo = Math.min(index, target);

		parent[key] = [...list.slice(0, lo), list[lo + 1], list[lo], ...list.slice(lo + 2)];
	}

	/**
	 * A page key is a URL path — the nav links to it and the route matches it — so
	 * renaming IS moving the entry under a new key, at the same position among its
	 * siblings. The value is carried over untouched, `defaults` and all.
	 */
	function renamePage(previous: string, next: string): boolean {
		if (!isRecord(draft?.pages) || previous === next || Object.hasOwn(draft.pages, next)) {
			return false;
		}

		const rebuilt: Record<string, unknown> = {};

		for (const [key, value] of Object.entries($state.snapshot(draft.pages))) {
			if (key === previous) {
				rebuilt[next] = value;
			} else {
				rebuilt[key] = value;
			}
		}

		draft.pages = rebuilt;

		return true;
	}

	function removePage(path: string): void {
		if (!isRecord(draft?.pages)) {
			return;
		}

		delete draft.pages[path];
	}

	/**
	 * Appends under the first free `/new-page` key, so two adds cannot collide into
	 * one page and every state this leaves behind normalizes warning-free — a page
	 * with no containers parses as empty, which is what the insertion point below it
	 * is for.
	 */
	function addPage(): void {
		if (!isRecord(draft)) {
			return;
		}

		const pages = record(draft, 'pages');
		let candidate = '/new-page';

		for (let n = 2; Object.hasOwn(pages, candidate); n += 1) {
			candidate = `/new-page-${String(n)}`;
		}

		pages[candidate] = {
			containers: [],
		};
	}

	/**
	 * The nav label, optional like the schema says: an empty field DELETES the key,
	 * the same absence semantics `writeField` gives every prop, so the nav falls
	 * back to the path rather than rendering an empty link text.
	 */
	function writePageName(page: Record<string, unknown>, value: string): void {
		if (value === '') {
			delete page.name;

			return;
		}

		page.name = value;
	}

	/**
	 * What a path edit has to satisfy before `renamePage` will take it. A key
	 * without the leading slash is dropped outright when the config is read — and
	 * refuse-on-warnings would make that drop block every save — so the form fixes
	 * the common case itself instead of writing a file it could never read back.
	 */
	function normalizePagePath(value: string): string | undefined {
		const trimmed = value.trim();

		if (trimmed === '') {
			return undefined;
		}

		return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	}

	const inputClass =
		'bg-surface-inset border-line-strong focus-visible:ring-ring rounded-md border px-box-sm py-text-2xs font-mono text-xs focus-visible:ring-2 focus-visible:outline-none';

	// The forms-plugin chevron sits 8px in from the right edge and spans 1.5em of
	// this text size (~26px deep), but px-box-sm leaves only 12px — the value ran
	// into the caret, because the utility beats the plugin's own 2.5rem padding.
	// One wider rung clears it; inputs keep inputClass untouched.
	const selectClass = `${inputClass} pr-box-2xl`;
	const buttonClass =
		'bg-surface-inset hover:bg-surface-hover focus-visible:ring-ring cursor-pointer rounded-md px-box-md py-text-2xs text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none';
</script>

<!--
	One insertion point. A list of N containers gets N + 1 of them, so a container can go
	anywhere in it and not only at the end.

	The label names the list it appends to, built by `listTarget` — identifiers, not copy,
	which is what keeps two same-type siblings' buttons apart: position counts within each
	list and every list starts at 1, so "position 1" alone is true of all of them at once.
-->
{#snippet insertPoint(insert: (index: number) => void, index: number, target: string)}
	<button
		type="button"
		class="border-line-soft text-ty-secondary hover:bg-surface-hover focus-visible:ring-ring cursor-pointer rounded-md border border-dashed px-box-sm py-text-3xs text-left text-xs focus-visible:ring-2 focus-visible:outline-none"
		onclick={() => insert(index)}
	>
		{m.admin_container_add_at({
			target,
			position: index + 1,
		})}
	</button>
{/snippet}

<!--
	One container, generated from its schema: the type select offers every declared name
	and the inputs come from `containerFields`, so a container added to
	`business/model/config.ts` and to `config-container.svelte` shows up here with no
	third edit. A prop name is an identifier from the config format, not copy, so it is
	the label verbatim and untranslated.

	The snippet renders its own children, which is what covers arbitrary nesting without a
	second component — and so without adding to the `config-container ↔ grid ↔ sub-grid`
	cycle that `no-circular` exempts by name. Two identifiers travel with it: `target`
	names the list this container SITS IN, which is what its move buttons say, and
	`childrenTarget` names THIS container, which is what its children's insertion
	buttons say — one list each, and neither has to be derived from the other.
-->
{#snippet containerEditor(
	container: Record<string, unknown>,
	siblings: unknown[],
	index: number,
	id: string,
	target: string,
	childrenTarget: string,
	move: (delta: -1 | 1) => void,
)}
	{@const name = typeof container.name === 'string' ? container.name : ''}
	<fieldset class="border-line-soft flex flex-col gap-text-2xs rounded-xl border p-box-md">
		<legend class="text-ty-secondary px-text-3xs font-mono text-xs">{name}</legend>

		<div class="flex flex-wrap items-end justify-between gap-text-sm">
			<label class="text-ty-secondary flex flex-col gap-text-3xs text-xs" for="{id}-name">
				{m.admin_container_type()}

				<select
					id="{id}-name"
					class={selectClass}
					value={name}
					onchange={(event) => {
						const next = event.currentTarget.value;

						if (next === name) {
							return;
						}

						container.name = next;

						// Props the NEW type does not declare are dropped here rather than
						// left for normalizeConfig to strip: refuse-on-warnings turns any
						// leftover (`items` surviving a Grid → BoxDate switch) into an
						// unsavable file the form cannot show, so keeping them was never an
						// option. What both schemas declare stays — `span` survives every
						// switch, `items` survives Grid ↔ SubGrid. Snapshot first: the values
						// go back in as a fresh plain object, which is the same whole-value
						// assignment `addContainer` makes.
						const shared = new Set(fieldsOf(next).map((field) => field.path.split('.')[0]));
						const previous = $state.snapshot(propsOf(container));

						container.props = Object.fromEntries(
							Object.entries(previous).filter(([key]) => shared.has(key)),
						);
					}}
				>
					<!-- A name the schema no longer declares still has to be visible and
					     removable: the config it sits in cannot be saved until it is gone. -->
					{#if !isDeclared(name)}
						<option value={name}>{name}</option>
					{/if}

					{#each containerTypes as [option] (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</label>

			<div class="flex items-end gap-text-3xs">
				<!-- Glyphs rather than words: two of these sit on every fieldset, and the
				     accessible name carries what a sighted operator gets from position —
				     which list and which slot — so the word would repeat it twice over.
				     Disabled at the edges rather than hidden: a hidden button moves the row
				     under the pointer between clicks. -->
				<button
					type="button"
					class="disabled:opacity-50 {buttonClass}"
					disabled={index === 0}
					aria-label={m.admin_container_move_up({
						target,
						position: index + 1,
					})}
					onclick={() => move(-1)}
				>
					↑
				</button>

				<button
					type="button"
					class="disabled:opacity-50 {buttonClass}"
					disabled={index === siblings.length - 1}
					aria-label={m.admin_container_move_down({
						target,
						position: index + 1,
					})}
					onclick={() => move(1)}
				>
					↓
				</button>

				<button
					type="button"
					class={buttonClass}
					onclick={() => {
						siblings.splice(index, 1);
					}}
				>
					{m.admin_container_remove()}
				</button>
			</div>
		</div>

		{#each fieldsOf(name) as field (field.path)}
			{#if field.kind === 'children'}
				<!-- A rule down the left, so a child list is visibly a level below the fieldset
				     that owns it rather than sharing its border with the parent's own controls.
				     `record` runs in the handler, never here: creating props during a render
				     would be a state mutation while rendering. -->
				<div class="border-line-soft flex flex-col gap-text-2xs border-l pl-box-md">
					{#each listOf(propsOf(container), field.path) as child, childIndex (childIndex)}
						{@render insertPoint(
							(at) => addContainer(record(container, 'props'), field.path, at),
							childIndex,
							childrenTarget,
						)}

						{#if isRecord(child)}
							{@render containerEditor(
								child,
								listOf(propsOf(container), field.path),
								childIndex,
								`${id}-${childIndex}`,
								name,
								listTarget(childrenTarget, child, childIndex),
								(delta) => moveContainer(record(container, 'props'), field.path, childIndex, delta),
							)}
						{/if}
					{/each}

					{@render insertPoint(
						(at) => addContainer(record(container, 'props'), field.path, at),
						listOf(propsOf(container), field.path).length,
						childrenTarget,
					)}
				</div>
			{:else if field.kind === 'enum'}
				<!-- A choice, not a text box. Text is the one kind a free-form field can always
				     satisfy; an enum is the first prop where a typo costs a REFUSED SAVE, and
				     offering the schema's own values is what makes that unreachable. -->
				<label class="text-ty-secondary flex flex-col gap-text-3xs text-xs" for="{id}-{field.path}">
					{field.path}

					<select
						id="{id}-{field.path}"
						class={selectClass}
						aria-required={field.isRequired}
						value={readField(container, field.path)}
						onchange={(event) => writeField(container, field, event.currentTarget.value)}
					>
						<!-- Blank is "not written", which is a different state from any of the values
						     and the one every existing config is in. It has to be selectable, or the
						     form would show a value the file does not carry — and picking it deletes
						     the key, because `writeField` treats empty as an absence. A dash rather
						     than a word: naming the schema's default here would put a second copy of
						     it in presentation, and this snippet is generic over every enum. -->
						<option value="">—</option>

						{#each field.options ?? [] as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
			{:else}
				<label class="text-ty-secondary flex flex-col gap-text-3xs text-xs" for="{id}-{field.path}">
					{field.path}

					<input
						id="{id}-{field.path}"
						class={inputClass}
						type={field.kind === 'number' ? 'number' : 'text'}
						spellcheck="false"
						aria-required={field.isRequired}
						value={readField(container, field.path)}
						oninput={(event) => writeField(container, field, event.currentTarget.value)}
					/>
				</label>
			{/if}
		{/each}
	</fieldset>
{/snippet}

<!-- col-span-12: the root layout renders its children into a 12-column grid.
     `bg-surface-card` rather than the `--box-surface` read the boxes do — that
     variable carries the depth a CONFIG container was placed at, and this page
     is not one. Nothing below it carries a blur: the card is already a backdrop
     root, so a nested one could not reach the scenery anyway. -->
<section
	class="bg-surface-card border-line-strong shadow-card col-span-12 flex flex-col gap-text-md rounded-2xl border p-box-xl backdrop-blur"
>
	<div class="flex flex-wrap items-center justify-between gap-text-sm">
		<!-- h2: the layout's app title is the page's only h1. -->
		<h2 class="text-xl font-semibold tracking-tight">{m.admin_title()}</h2>

		<form method="POST" action="?/logout">
			<button class={buttonClass}>{m.admin_sign_out()}</button>
		</form>
	</div>

	<form method="POST" action="?/save" class="flex flex-col gap-text-md">
		<h3
			id="admin-config-heading"
			class="text-ty-secondary text-xs font-semibold tracking-wider uppercase"
		>
			{m.admin_config_heading()}
		</h3>

		{#if data.readFailed}
			<p class="text-sm" role="alert">{m.admin_config_read_failed()}</p>
		{/if}

		{#if data.needsRawEditor}
			<!-- The repair path, and only that: raw JSON when the form cannot represent this
			     file — it does not parse, or it carries something `normalizeConfig` would drop,
			     which refuse-on-warnings makes unsavable and the form cannot show. Fixing it
			     here brings the form back. The heading is the field's accessible name. -->
			<p class="text-sm">{m.admin_config_raw_editor()}</p>

			<textarea
				name="config"
				rows="24"
				spellcheck="false"
				aria-labelledby="admin-config-heading"
				class="bg-surface-inset border-line-soft focus-visible:ring-ring w-full resize-y rounded-xl border p-box-md font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
				value={source()}></textarea>
		{:else if draft}
			<!-- The submitted payload, kept in step with the fields above. It is also what a
			     browser with no javascript submits: the file's own bytes, so a save there
			     rewrites the file it read rather than losing anything. -->
			<input type="hidden" name="config" value={serialized} />

			{#each pages as [path, page], pageIndex (path)}
				<div class="flex flex-col gap-text-2xs">
					<div class="flex flex-wrap items-end justify-between gap-text-sm">
						<!-- The key IS the URL path, so it is edited in place; the nav label is
						     optional and falls back to the path when absent. -->
						<div class="flex flex-wrap items-end gap-text-sm">
							<label
								class="text-ty-secondary flex flex-col gap-text-3xs text-xs"
								for="admin-page-{pageIndex}-path"
							>
								{m.admin_page_path()}

								<input
									id="admin-page-{pageIndex}-path"
									class="{inputClass} font-mono"
									type="text"
									spellcheck="false"
									value={path}
									onchange={(event) => {
										const next = normalizePagePath(event.currentTarget.value);

										// A rename that would not parse as a page key never
										// commits, and the input shows the key still in force —
										// a silent revert beats a draft that can never be saved.
										if (next === undefined || !renamePage(path, next)) {
											event.currentTarget.value = path;
										}
									}}
								/>
							</label>

							<label
								class="text-ty-secondary flex flex-col gap-text-3xs text-xs"
								for="admin-page-{pageIndex}-name"
							>
								{m.admin_page_name()}

								<input
									id="admin-page-{pageIndex}-name"
									class={inputClass}
									type="text"
									value={typeof page.name === 'string' ? page.name : ''}
									oninput={(event) => writePageName(page, event.currentTarget.value)}
								/>
							</label>
						</div>

						<button type="button" class={buttonClass} onclick={() => removePage(path)}>
							{m.admin_page_remove()}
						</button>
					</div>

					<!-- h4 under the h3 above; a page path is an identifier, not copy — and it is
					     also the id the header's pen links to as `/admin#<page path>`, so kit
					     scrolls here and continues tabbing from here. The scroll margin is what
					     keeps the sticky header off the heading it just arrived at. -->
					<h4 id={path} class="scroll-mt-section-lg font-mono text-sm font-semibold">{path}</h4>

					{#each listOf(page, 'containers') as container, index (index)}
						{@render insertPoint((at) => addContainer(page, 'containers', at), index, path)}

						{#if isRecord(container)}
							{@render containerEditor(
								container,
								listOf(page, 'containers'),
								index,
								`admin-${pageIndex}-${index}`,
								path,
								listTarget(path, container, index),
								(delta) => moveContainer(page, 'containers', index, delta),
							)}
						{/if}
					{/each}

					{@render insertPoint(
						(at) => addContainer(page, 'containers', at),
						listOf(page, 'containers').length,
						path,
					)}
				</div>
			{/each}

			<button type="button" class="{buttonClass} self-start" onclick={addPage}>
				{m.admin_page_add()}
			</button>
		{/if}

		{#if form && 'rejection' in form}
			<div class="flex flex-col gap-text-2xs text-sm" role="alert">
				{#if form.rejection === 'invalid-json'}
					<p>{m.admin_config_invalid_json()}</p>
				{:else if form.rejection === 'not-an-object'}
					<p>{m.admin_config_not_an_object()}</p>
				{:else if form.rejection === 'write-failed'}
					<p>{m.admin_config_write_failed()}</p>
				{:else}
					<p>{m.admin_config_rejected()}</p>

					<!-- Deliberate carve-out from the no-copy-crosses-a-layer rule: these are
					     `normalizeConfig`'s own diagnostic sentences, unlocalized. The admin
					     area's only audience is the operator who set DASHBOARD_ADMIN_TOKEN and
					     reads the server log, and this is that log, so it renders as one. -->
					<ul class="text-ty-secondary flex flex-col gap-text-3xs font-mono text-xs">
						{#each form.warnings as warning (warning)}
							<li>{warning}</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		{#if form && 'saved' in form}
			<p class="text-sm" role="status">{m.admin_config_saved()}</p>
		{/if}

		<button type="submit" class="{buttonClass} self-start">{m.admin_config_save()}</button>
	</form>
</section>
