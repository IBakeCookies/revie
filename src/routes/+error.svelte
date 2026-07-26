<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
</script>

<div class="col-span-12 p-box-xl text-center bg-box-secondary rounded-xs">
	<h2 class="text-2xl font-bold">{page.status}</h2>
	<p class="text-ty-secondary">{page.error?.message ?? m.error_unknown()}</p>
</div>
