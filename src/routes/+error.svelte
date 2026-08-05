<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
</script>

<div
	class="border-line-soft col-span-12 flex flex-col items-center gap-text-2xs rounded-lg border bg-(--box-surface,var(--surface-card)) px-box-md py-empty-state text-center backdrop-blur"
>
	<h2 class="text-ty-silent text-4xl font-semibold tabular-nums">{page.status}</h2>
	<p class="text-ty-secondary">{page.error?.message ?? m.error_unknown()}</p>
</div>
