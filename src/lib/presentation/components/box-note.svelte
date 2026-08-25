<script lang="ts">
	import { spanStyle } from '$lib/utils/style';

	export type Props = {
		/** The body, shown as written — verbatim text, never markup. */
		text: string;
		span?: number;
	};

	let { text, span }: Props = $props();
</script>

<!-- No title prop, on purpose: a note is a body, not a section — the heading belongs
     to the Grid above it. `{text}` is a text node, so what the config carries is what
     renders; `whitespace-pre-line` is what makes the newlines real. -->
<div
	style={spanStyle(span)}
	class="border-line-soft col-span-12 whitespace-pre-line rounded-2xl border bg-(--box-surface,var(--surface-card)) p-box-lg backdrop-blur xl:col-span-(--span)"
>
	{text}
</div>
