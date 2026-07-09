<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn } from '$lib/utils/style';

	export type Props = {
		a: string;
		class?: ClassValue;
	} & HTMLAttributes<any>;

	let props: Props = $props();
</script>

<div
	{...props}
	class={cn('col-span-12 p-box-md text-xl text-center bg-box-secondary rounded-xs', props.class)}
>
	{a}
</div>
