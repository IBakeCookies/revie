<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	export type Props = {
		messages: readonly string[];
		ondismiss: (message: string) => void;
	};

	let { messages, ondismiss }: Props = $props();
</script>

<!-- The region is rendered unconditionally, empty or not: a live region added to the
     DOM at the same moment as its first message is not announced, so a toast that
     appeared with it would be silent. `aria-live="polite"` and not `role="alert"` — a
     failed probe is a reading, not an interruption. -->
<!-- pointer-events-none on the region, auto on each toast: it spans the width of the
     viewport, so anything else it covered would stop being clickable. -->
<div
	class="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-text-2xs p-page-sm"
	role="status"
	aria-live="polite"
>
	{#each messages as message (message)}
		<!-- `bg-popover`, the opaque page surface, for the same reason the dropdown panel
		     uses it rather than the translucent card: this floats over arbitrary content
		     and has to stay readable on the glass themes. Opaque, so no backdrop-blur. -->
		<div
			class="bg-popover border-line-strong shadow-card pointer-events-auto flex max-w-prose items-center gap-text-xs rounded-lg border px-box-md py-box-sm"
		>
			<span class="bg-danger size-2 shrink-0 rounded-full" aria-hidden="true"></span>
			<p class="text-ty-secondary min-w-0 text-sm">{message}</p>
			<button
				type="button"
				onclick={() => ondismiss(message)}
				aria-label={m.toast_dismiss()}
				class="text-ty-silent hover:text-ty-primary focus-visible:ring-ring ml-auto shrink-0 cursor-pointer rounded-full px-box-3xs text-sm focus-visible:ring-2 focus-visible:outline-none"
			>
				&#10005;
			</button>
		</div>
	{/each}
</div>
