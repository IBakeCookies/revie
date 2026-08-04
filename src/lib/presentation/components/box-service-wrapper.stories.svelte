<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect, fn, waitFor } from 'storybook/test';
	import BoxServiceWrapper from '$lib/presentation/components/box-service-wrapper.svelte';

	/* The store's ErrorReporter defaults to console.error. Injecting a spy is the
	   whole point of that seam — and it lets a story assert that a failed probe was
	   reported rather than swallowed. */
	const report = fn();

	const { Story } = defineMeta({
		title: 'Components/Box Service Wrapper',
		component: BoxServiceWrapper,
		tags: ['autodocs'],
		args: {
			title: 'Pi-hole',
			href: 'http://unprobed.local:8080',
			img: {
				src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
			},
			span: 4,
		},
	});
</script>

<script lang="ts">
	import { setServicesStore } from '$lib/business/store/service-store.svelte';

	/* The wrapper reads the store out of context, so it cannot mount without one —
	   and `setContext` needs a component being initialised, which the module script
	   above is not. */
	const servicesStore = setServicesStore(report);

	/* `refresh` is the store's only writer, and it really POSTs /api/ping — a route
	   no storybook server serves. Stubbing the transport keeps the STORE the thing
	   that decides the state, so these stories still prove the store → prop path
	   instead of a hand-set `isOnline`.

	   Each helper RESTORES the stub before returning: `clearMocks` drops call history
	   between tests but does not put a patched global back, so a stub left installed
	   answers for every story declared after this one in the file. */
	async function withFetch(stub: typeof globalThis.fetch, href: string): Promise<void> {
		const original = globalThis.fetch;

		globalThis.fetch = stub;

		try {
			await servicesStore.refresh(href);
		} finally {
			globalThis.fetch = original;
		}
	}

	async function probe(href: string, isAlive: boolean): Promise<void> {
		await withFetch(
			(async () =>
				new Response(
					JSON.stringify({
						isAlive,
					}),
				)) as typeof globalThis.fetch,
			href,
		);
	}

	async function probeFailure(href: string): Promise<void> {
		await withFetch(
			(async () => {
				throw new Error('probe failed');
			}) as typeof globalThis.fetch,
			href,
		);
	}
</script>

<!-- State is keyed by href, so an href this file never probes stays unknown however
     the stories are ordered — and unknown is the state every box has on first paint,
     before any probe has answered. -->
<Story
	name="Unknown until probed"
	play={async ({ canvasElement, args }) => {
		const box = canvasElement.querySelector('a');

		// The wrapper forwards its props untouched; only `isOnline` is its own.
		await expect(box).toHaveAttribute('href', args.href);

		// `--span` must always be emitted: an unset custom property makes
		// `grid-column` invalid at computed-value time, dropping the declaration.
		await expect(box).toHaveStyle({
			'--span': '4',
		});

		// The inset surface is translucent in all 27 themes, so it carries the blur.
		await expect(box).toHaveClass('backdrop-blur');

		// `null` is not `false`: an unprobed service must not show a red dot.
		const dot = canvasElement.querySelector('[aria-label]');

		await expect(dot).toHaveAttribute('aria-label', 'status unknown');
		await expect(dot).toHaveClass('bg-primary');
	}}
/>

<!-- The store says alive, and the dot the wrapper never touches turns green -->
<Story
	name="Store reports up"
	args={{
		title: 'Jellyfin',
		href: 'http://up.local:8096',
	}}
	play={async ({ canvasElement, args }) => {
		await probe(args.href, true);

		await waitFor(async () => {
			const dot = canvasElement.querySelector('[aria-label]');

			await expect(dot).toHaveAttribute('aria-label', 'online');
			await expect(dot).toHaveClass('bg-success');
		});

		// Nothing failed, so the reporter stays silent — a green dot and a reported
		// error would mean the store had guessed.
		await expect(report).not.toHaveBeenCalled();
	}}
/>

<!-- Only an ANSWERED probe may render offline, which is the one case that earns red -->
<Story
	name="Store reports down"
	args={{
		title: 'Sonarr',
		href: 'http://down.local:8989',
	}}
	play={async ({ canvasElement, args }) => {
		await probe(args.href, false);

		await waitFor(async () => {
			const dot = canvasElement.querySelector('[aria-label]');

			await expect(dot).toHaveAttribute('aria-label', 'offline');
			await expect(dot).toHaveClass('bg-danger');
		});
	}}
/>

<!-- A probe that FAILS is not a service that is DOWN. The store keeps the last known
     state and hands the error on, so the box must not flip to red — the three
     responsibilities (state, decision, reporting) stay separate. -->
<Story
	name="Failed probe keeps the last known state"
	args={{
		title: 'AdGuard',
		href: 'http://flaky.local:3000',
	}}
	play={async ({ canvasElement, args }) => {
		await probe(args.href, true);

		await waitFor(async () => {
			await expect(canvasElement.querySelector('[aria-label]')).toHaveClass('bg-success');
		});

		await probeFailure(args.href);

		await expect(canvasElement.querySelector('[aria-label]')).toHaveClass('bg-success');

		// Errors are values: the repository's own message reaches the injected
		// reporter, so it can be rendered instead of printed.
		await expect(report).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'probe failed',
			}),
		);
	}}
/>
