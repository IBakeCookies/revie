<script lang="ts">
	import { spanStyle } from '$lib/utils/style';
	import { m } from '$lib/paraglide/messages';

	export type Props = {
		/** The engine's endpoint: the browser appends `?q=…` to it and navigates. */
		href: string;
		placeholder?: string;
		span?: number;
	};

	let { href, placeholder, span }: Props = $props();

	let field = $state<HTMLInputElement>();

	function focusOnSlash(event: KeyboardEvent): void {
		// Not while the user is in a field — including this box's own, where a typed
		// slash has to reach the query.
		if (
			event.key !== '/' ||
			(event.target instanceof HTMLElement && event.target.matches('input'))
		) {
			return;
		}

		// Not tidiness: the character is inserted against whatever is focused BY THEN, so
		// an unprevented slash lands in the field this handler just focused — and opens
		// Firefox's quick find on the way.
		event.preventDefault();
		field?.focus();
	}
</script>

<svelte:window onkeydown={focusOnSlash} />

<!-- No submit button: one field that blocks implicit submission is all it takes for Enter
     to submit, so a second field would silently end that. `rel="noreferrer"` suppresses the
     Referer on submit: the dashboard's URL is an internal address. -->
<form
	action={href}
	method="get"
	rel="noreferrer"
	style={spanStyle(span)}
	class="border-line-soft col-span-12 rounded-2xl border bg-(--box-surface,var(--surface-card)) p-box-lg backdrop-blur xl:col-span-(--span)"
>
	<!-- `aria-label`, not a visible label: the box is one control and a placeholder is not
	     a name. The same message is the placeholder's fallback, so a config that leaves
	     `placeholder` out still gets a box that says what it is. -->
	<input
		bind:this={field}
		name="q"
		type="search"
		placeholder={placeholder ?? m.search_label()}
		aria-label={m.search_label()}
		class="bg-surface-inset border-line-strong focus-visible:ring-ring w-full rounded-md border px-box-sm py-text-2xs focus-visible:ring-2 focus-visible:outline-none"
	/>
</form>
