<script lang="ts">
	import type { PageProps } from './$types';
	import { m } from '$lib/paraglide/messages';

	let { form }: PageProps = $props();
</script>

<!-- col-span-12: the root layout renders its children into a 12-column grid. -->
<section class="col-span-12 flex justify-center">
	<form
		method="POST"
		class="bg-surface-card border-line-strong shadow-card flex w-full max-w-sm flex-col gap-text-sm rounded-2xl border p-box-xl backdrop-blur"
	>
		<!-- h2: the layout's app title is the page's only h1. -->
		<h2 class="text-xl font-semibold tracking-tight">{m.admin_sign_in()}</h2>

		<label class="flex flex-col gap-text-3xs text-sm" for="token">
			{m.admin_token_label()}

			<!-- The field is never re-populated from the submitted value: a rejected
			     token has no business in the HTML. -->
			<input
				id="token"
				name="token"
				type="password"
				autocomplete="current-password"
				required
				class="bg-surface-inset border-line-strong focus-visible:ring-ring rounded-md border px-box-sm py-text-2xs focus-visible:ring-2 focus-visible:outline-none"
			/>
		</label>

		{#if form?.invalid}
			<p class="text-sm" role="alert">{m.admin_sign_in_failed()}</p>
		{/if}

		{#if form?.locked}
			<p class="text-sm" role="alert">
				{m.admin_sign_in_locked({
					seconds: form.retryAfterSeconds,
				})}
			</p>
		{/if}

		<button
			type="submit"
			class="bg-surface-inset hover:bg-surface-hover focus-visible:ring-ring cursor-pointer rounded-md px-box-md py-text-2xs text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
		>
			{m.admin_sign_in()}
		</button>
	</form>
</section>
