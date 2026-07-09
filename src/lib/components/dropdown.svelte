<script lang="ts">
    import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn } from '$lib/utils/style';

	export type Props = {
        trigger: Snippet;
        children: Snippet;
		class?: ClassValue;
	} & HTMLAttributes<any>;

	let { trigger, children, ...restProps}: Props = $props();
</script>

<div
	{...restProps}
	class={cn('group relative z-1', restProps.class)}
>
    <button class="bg-box-secondary border-glass glass-y solid:border py-box-xs px-box-lg  rounded-xs">
        {@render trigger()}
    </button>
    
    <div class="pt-ty-list-2xs transition-all absolute top-full left-0 invisible opacity-0 group-hover:opacity-100 group-hover:visible">
        <div class="bg-background size-max border-glass glass-x solid:border rounded-xs">
            {@render children()}
        </div>
    </div>
</div>
