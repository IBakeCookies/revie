<script lang="ts">
	import type { PageProps } from './$types';
	import { m } from '$lib/paraglide/messages';

	let { data, form }: PageProps = $props();

	// A rejected submission comes back with the text that was refused, so the operator
	// keeps their edit; otherwise the editor shows the file as it is on disk.
	const text = $derived(form && 'text' in form ? form.text : data.text);
</script>

<!-- col-span-12: the root layout renders its children into a 12-column grid.
     `bg-surface-card` rather than the `--box-surface` read the boxes do — that
     variable carries the depth a CONFIG container was placed at, and this page
     is not one. -->
<section
	class="bg-surface-card border-line-strong shadow-card col-span-12 flex flex-col gap-text-md rounded-2xl border p-box-xl backdrop-blur"
>
	<div class="flex flex-wrap items-center justify-between gap-text-sm">
		<!-- h2: the layout's app title is the page's only h1. -->
		<h2 class="text-xl font-semibold tracking-tight">{m.admin_title()}</h2>

		<form method="POST" action="?/logout">
			<button
				class="bg-surface-inset hover:bg-surface-hover focus-visible:ring-ring cursor-pointer rounded-md px-box-md py-text-2xs text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
			>
				{m.admin_sign_out()}
			</button>
		</form>
	</div>

	<form method="POST" action="?/save" class="flex flex-col gap-text-md">
		<h3
			id="admin-config-heading"
			class="text-ty-secondary text-xs font-semibold tracking-wider uppercase"
		>
			{m.admin_config_heading()}
		</h3>

		<!-- Raw JSON, and interim: roadmap #35 replaces this with a form generated from
		     the container schema. The heading is the field's accessible name. -->
		<textarea
			name="config"
			rows="24"
			spellcheck="false"
			aria-labelledby="admin-config-heading"
			class="bg-surface-inset border-line-soft focus-visible:ring-ring w-full resize-y rounded-xl border p-box-md font-mono text-xs focus-visible:ring-2 focus-visible:outline-none"
			value={text}></textarea>

		{#if data.readFailed}
			<p class="text-sm" role="alert">{m.admin_config_read_failed()}</p>
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

		<button
			type="submit"
			class="bg-surface-inset hover:bg-surface-hover focus-visible:ring-ring cursor-pointer self-start rounded-md px-box-md py-text-2xs text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
		>
			{m.admin_config_save()}
		</button>
	</form>
</section>
