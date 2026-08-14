<script lang="ts">
	import type { PageProps } from './$types';
	import { m } from '$lib/paraglide/messages';

	let { data }: PageProps = $props();
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

	<h3 class="text-ty-secondary text-xs font-semibold tracking-wider uppercase">
		{m.admin_config_heading()}
	</h3>

	<!-- Read-only for now; editing is a later, separate piece of work. -->
	<pre
		class="bg-surface-inset border-line-soft overflow-x-auto rounded-xl border p-box-md text-xs">{JSON.stringify(
			data.config,
			null,
			2,
		)}</pre>
</section>
