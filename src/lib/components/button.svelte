<script lang="ts">
    import type { Snippet } from 'svelte';
    import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn } from '$lib/utils/style';
    import { getButtonVariantStyle } from '$lib/utils/variant';

    type Props = {
        href?: string;
        isLoading?: boolean;
        variant?: StylePath;
        size?: 'default' | 'small' | 'tiny' | 'square';
        disabled?: boolean;
        class?: ClassValue;
        children?: Snippet;
        // onHoverSnippet?: Snippet;
    } & HTMLButtonAttributes;

    interface Config {
        size: Props['size'];
        variant: StylePath;
    }

    const {
        href,
        isLoading,
        variant = 'neutral-dark-base',
        size = 'default',
        disabled,
        children,
        // onHoverSnippet,
        ...props
    }: Props = $props();

    function getSizeStyle(size: Props['size']): string {
        switch (size) {
            case 'default':
                return 'px-box py-3';
            case 'small':
                return 'px-4 py-2';
            case 'tiny':
                return 'px-2 py-1';
            case 'square':
                return 'min-w-7 min-h-7';
        }

        return 'px-box py-3';
    }

    function getButtonStyle(config: Config): string {
        const { size, variant } = config;
        const colorStyles = getButtonVariantStyle(variant);
        const sizeStyle = getSizeStyle(size);

        return `group inline-flex cursor-pointer items-center justify-center border-2 border-transparent transition-colors disabled:opacity-50 ${colorStyles} ${sizeStyle}`;
    }
</script>

<svelte:element
    this={href ? 'a' : 'button'}
    {...props}
    {href}
    class={cn(
        getButtonStyle({
            size,
            variant,
        }),
        props.class,
        {
            'pointer-events-none': isLoading || disabled,
        },
    )}
    disabled={isLoading || disabled}
>
    {@render children?.()}

    {#if isLoading}
        <Icon icon="bi:arrow-repeat" class="ml-icon h-6 w-6 animate-spin" />
    {/if}

    <!-- {#if variant === 'anchor'}
        <span
            class="absolute top-full left-0 h-[2px] w-full origin-left scale-x-0 bg-stone-900 transition-transform group-hover:scale-x-100"
        >
        </span>
    {/if} -->
</svelte:element>