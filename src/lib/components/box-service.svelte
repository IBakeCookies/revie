<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn } from '$lib/utils/style';

	type Props = {
		title: string;
		href: string;
		img: {
			src: string;
		};
		isOnline: boolean | null;
		class?: ClassValue;
	} & HTMLAttributes<any>;

	let { isOnline = null, title, href, img, ...restProps }: Props = $props();
</script>

<a
	{...restProps}
	{href}
	target="_blank"
	class={cn(
		'@container/box-service border border-transparent cursor-pointer rounded-xs bg-box-secondary p-box-md relative hover:border-border transition-colors col-span-12',
		restProps.class
	)}
>
	<div class="gap-ty-list-md flex flex-col @2xs/box-service:flex-row items-center">
		<img class="object-contain min-w-10 size-10" src={img.src} alt="service" />

		<h3>{title}</h3>

		<span
			class={[
				'absolute top-4 right-4 ml-auto p-1 rounded-full',
				isOnline === true ? 'bg-success' : isOnline === false ? 'bg-danger' : 'bg-primary'
			]}
		>
		</span>
	</div>
</a>
