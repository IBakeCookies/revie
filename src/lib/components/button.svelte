<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { ClassValue } from 'clsx';
	import { cn } from '$lib/utils/style';

	export type Props = {
		class?: ClassValue;
	} & HTMLAttributes<any>;

	const formatter = new Intl.DateTimeFormat('en', {
		weekday: 'short',
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});

	let props: Props = $props();
	let currentDate = $state(formatter.format(new Date()));

	$effect(() => {
		const id = setInterval(() => {
			currentDate = formatter.format(new Date());
		}, 1000);

		return () => {
			clearInterval(id);
		};
	});
</script>

<button {...props} class={cn('rounded-button', props.class)}>
	{currentDate}
</button>
