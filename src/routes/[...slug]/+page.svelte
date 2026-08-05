<script lang="ts">
	import type { PageProps } from './$types';
	import Page from '$lib/presentation/components/page.svelte';
	import { getToastStore } from '$lib/business/store/toast-store.svelte';
	import { m } from '$lib/paraglide/messages';

	let { data }: PageProps = $props();

	const toasts = getToastStore();

	// This route is where every failure gets its words. Both stores below hand over
	// data only — a boolean from the load, an href from the probe — and the paraglide
	// call is here, in presentation, so both toasts follow the user's language.
	//
	// The server can only log, which reaches an operator's journal and nobody looking
	// at the page. This is what tells them WHY the AdGuard box is empty; the reason it
	// failed stays in that log, which already names the host and the status. The store
	// dedupes by message, so re-reporting on every navigation does not stack it up.
	$effect(() => {
		if (data.adguardFailed) {
			toasts.show(m.adguard_load_failed());
		}
	});
</script>

<Page
	adguard={data.adguard}
	containers={data.containers}
	notify={(href) =>
		toasts.show(
			m.service_probe_failed({
				href,
			}),
		)}
/>
