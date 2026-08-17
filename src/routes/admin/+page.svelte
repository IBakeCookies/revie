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
	 * reordering is not on offer, so an append-only form cannot put a box before an
	 * existing one at all.
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

	const inputClass =
		'bg-surface-inset border-line-strong focus-visible:ring-ring rounded-md border px-box-sm py-text-2xs font-mono text-xs focus-visible:ring-2 focus-visible:outline-none';
	const buttonClass =
		'bg-surface-inset hover:bg-surface-hover focus-visible:ring-ring cursor-pointer rounded-md px-box-md py-text-2xs text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none';
</script>

<!--
	One insertion point. A list of N containers gets N + 1 of them, so a container can go
	anywhere in it and not only at the end.

	The label names the list it appends to — the parent container's type, or the page path,
	both identifiers rather than copy. That is what makes it unambiguous which list an
	insert targets: a Grid whose last child is a SubGrid renders its own trailing button
	directly under that SubGrid's controls, where an unqualified "add" reads as the
	SubGrid's and the Grid's looks missing.
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
	cycle that `no-circular` exempts by name.
-->
{#snippet containerEditor(
	container: Record<string, unknown>,
	siblings: unknown[],
	index: number,
	id: string,
)}
	{@const name = typeof container.name === 'string' ? container.name : ''}
	<fieldset class="border-line-soft flex flex-col gap-text-2xs rounded-xl border p-box-md">
		<legend class="text-ty-secondary px-text-3xs font-mono text-xs">{name}</legend>

		<div class="flex flex-wrap items-end justify-between gap-text-sm">
			<label class="text-ty-secondary flex flex-col gap-text-3xs text-xs" for="{id}-name">
				{m.admin_container_type()}

				<select
					id="{id}-name"
					class={inputClass}
					value={name}
					onchange={(event) => {
						container.name = event.currentTarget.value;
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
							name,
						)}

						{#if isRecord(child)}
							{@render containerEditor(
								child,
								listOf(propsOf(container), field.path),
								childIndex,
								`${id}-${childIndex}`,
							)}
						{/if}
					{/each}

					{@render insertPoint(
						(at) => addContainer(record(container, 'props'), field.path, at),
						listOf(propsOf(container), field.path).length,
						name,
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
						class={inputClass}
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
					<!-- h4 under the h3 above; a page path is an identifier, not copy. -->
					<h4 class="font-mono text-sm font-semibold">{path}</h4>

					{#each listOf(page, 'containers') as container, index (index)}
						{@render insertPoint((at) => addContainer(page, 'containers', at), index, path)}

						{#if isRecord(container)}
							{@render containerEditor(
								container,
								listOf(page, 'containers'),
								index,
								`admin-${pageIndex}-${index}`,
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
