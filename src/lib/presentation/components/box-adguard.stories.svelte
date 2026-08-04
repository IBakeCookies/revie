<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import BoxAdguard from '$lib/presentation/components/box-adguard.svelte';
	import { m } from '$lib/paraglide/messages';

	const { Story } = defineMeta({
		title: 'Components/Box Adguard',
		component: BoxAdguard,
		tags: ['autodocs'],
		args: {
			href: 'http://adguard.local',
			span: 6,
			stats: {
				dnsQueries: 1234,
				numBlockedFiltering: 56,
				avgProcessingTimeMs: 12,
				topBlockedDomain: 'ads.example.com',
			},
		},
	});
</script>

<!-- The whole box is one link to the admin UI, so the four readings sit inside an anchor -->
<Story
	name="Healthy stats"
	play={async ({ args, canvas, canvasElement }) => {
		const link = canvas.getByRole('link');

		// `rel="noreferrer"` is the point of the assertion, not the href: the dashboard
		// URL is an internal address and must not travel to the AdGuard instance.
		await expect(link).toHaveAttribute('href', args.href);
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noreferrer');

		// Asserted through `m` rather than a literal, because a hardcoded string here
		// would be a second copy of messages/en.json that nothing keeps in step.
		await expect(
			canvas.getByText(
				m.adguard_dns_queries({
					count: 1234,
				}),
			),
		).toBeInTheDocument();

		await expect(
			canvas.getByText(
				m.adguard_blocked({
					count: 56,
				}),
			),
		).toBeInTheDocument();

		await expect(
			canvas.getByText(
				m.adguard_delay({
					milliseconds: 12,
				}),
			),
		).toBeInTheDocument();

		await expect(
			canvas.getByText(
				m.adguard_top_blocked_domain({
					domain: 'ads.example.com',
				}),
				{
					exact: true,
				},
			),
		).toBeInTheDocument();

		// The card is a translucent inset surface, so it carries its own backdrop-blur —
		// without it the theme's background image shows through unfrosted.
		await expect(link).toHaveClass('bg-surface-inset');
		await expect(link).toHaveClass('backdrop-blur');

		// `--span` must always be emitted: an unset custom property makes `grid-column`
		// invalid at computed-value time and drops the whole declaration.
		await expect(link).toHaveStyle({
			'--span': '6',
		});

		// Each reading is keyed by a semantic border token from tokens.css. A raw palette
		// class (border-red-400) would look right in one theme and wrong in the other 26.
		const readings = [...canvasElement.querySelectorAll('p')];

		await expect(readings).toHaveLength(4);

		await expect(readings.map((p) => p.className.split(' ').at(-1))).toEqual([
			'border-success',
			'border-danger',
			'border-info',
			'border-warning',
		]);
	}}
/>

<!-- AdGuard unreachable: business hands the failure back as a value, the store keeps no
     stats, and `stats` arrives undefined through box-adguard-wrapper. The box stays, empty. -->
<Story
	name="Unreachable"
	args={{
		stats: undefined,
	}}
	play={async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelectorAll('p')).toHaveLength(0);

		// The link is what makes the empty box useful — it is how an operator gets to the
		// admin UI to find out why the probe failed.
		await expect(canvas.getByRole('link')).toBeInTheDocument();
	}}
/>

<!-- A quiet DNS resolver reports zeros, not nothing: every reading is interpolated, so a
     falsy count must still render rather than collapse the row. -->
<Story
	name="Zero traffic"
	args={{
		stats: {
			dnsQueries: 0,
			numBlockedFiltering: 0,
			avgProcessingTimeMs: 0,
			topBlockedDomain: '',
		},
	}}
	play={async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelectorAll('p')).toHaveLength(4);

		await expect(
			canvas.getByText(
				m.adguard_dns_queries({
					count: 0,
				}),
			),
		).toBeInTheDocument();

		await expect(
			canvas.getByText(
				m.adguard_delay({
					milliseconds: 0,
				}),
			),
		).toBeInTheDocument();
	}}
/>

<!-- `span` is a token (1-12) mapped to a custom property, never a class name: a class that
     only ever appears in runtime config is never scanned by Tailwind and produces no CSS. -->
<Story
	name="Full width"
	args={{
		span: 12,
	}}
	play={async ({ canvas }) => {
		await expect(canvas.getByRole('link')).toHaveStyle({
			'--span': '12',
		});
	}}
/>

<!-- No span in config: the property still has to be emitted, or the column rule dies -->
<Story
	name="Unset span"
	args={{
		span: undefined,
	}}
	play={async ({ canvas }) => {
		const link = canvas.getByRole('link');

		await expect(link).toHaveAttribute('style');
		await expect(link.getAttribute('style')).toContain('--span');
	}}
/>
