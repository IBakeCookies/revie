<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import { expect } from 'storybook/test';
	import BoxAdguard from '$lib/presentation/components/box-adguard.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	// Built from the same locale the component reads, so a render in the wrong locale cannot
	// pass by matching a hardcoded string.
	const counts = new Intl.NumberFormat(getLocale());
	const millis = new Intl.NumberFormat(getLocale(), {
		style: 'unit',
		unit: 'millisecond',
		unitDisplay: 'narrow',
	});

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

		// Labels asserted through `m` rather than a literal, because a hardcoded string here
		// would be a second copy of messages/en.json that nothing keeps in step. The pairing
		// is the claim: a label sitting next to the wrong number is the failure to catch.
		const tiles = [...canvasElement.querySelectorAll('dl > div')];

		await expect(
			tiles.map((tile) => [
				tile.querySelector('dt')?.textContent,
				tile.querySelector('dd')?.textContent,
			]),
		).toEqual([
			[m.adguard_dns_queries(), counts.format(1234)],
			[m.adguard_blocked(), counts.format(56)],
			[m.adguard_delay(), millis.format(12)],
			[m.adguard_top_blocked_domain(), 'ads.example.com'],
		]);

		// The card is a translucent surface, so it carries its own backdrop-blur —
		// without it the theme's background image shows through unfrosted. The fill
		// itself comes from whatever the box sits in; a story mounts no card, so it
		// is the fallback here.
		await expect(link).toHaveClass('bg-(--box-surface,var(--surface-card))');
		await expect(link).toHaveClass('backdrop-blur');

		// `--span` must always be emitted: an unset custom property makes `grid-column`
		// invalid at computed-value time and drops the whole declaration.
		await expect(link).toHaveStyle({
			'--span': '6',
		});

		// Each reading is keyed by a semantic border token from tokens.css. A raw palette
		// class (border-red-400) would look right in one theme and wrong in the other 26.
		const accents = ['border-l-success', 'border-l-danger', 'border-l-info', 'border-l-warning'];

		for (const [index, accent] of accents.entries()) {
			await expect(tiles[index]).toHaveClass(accent);
		}

		// A reading sits ON this box, so the box declares the step below itself for
		// them rather than each reading naming a fill it cannot know is right.
		await expect(getComputedStyle(tiles[0]).backgroundColor).toBe(
			getComputedStyle(document.documentElement).getPropertyValue('--surface-inset').trim(),
		);
	}}
/>

<!-- AdGuard unreachable: business hands the failure back as a value, the store keeps no
     stats, and `stats` arrives undefined through box-adguard-wrapper. The box stays and
     says why — a padded empty rectangle reads as a layout bug instead. -->
<Story
	name="Unreachable"
	args={{
		stats: undefined,
	}}
	play={async ({ canvas, canvasElement }) => {
		await expect(canvasElement.querySelectorAll('p')).toHaveLength(1);
		await expect(canvas.getByText(m.adguard_unavailable())).toBeInTheDocument();

		// The link is what makes the empty box useful — it is how an operator gets to the
		// admin UI to find out why the probe failed.
		await expect(canvas.getByRole('link')).toBeInTheDocument();
	}}
/>

<!-- A quiet DNS resolver reports zeros, not nothing: every reading is formatted, so a falsy
     count must still render as a zero rather than collapse the tile. -->
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
	play={async ({ canvasElement }) => {
		// Read off the `dd`s rather than by text: the two zero counts are the same string,
		// so a text query could not tell a rendered tile from a missing one.
		await expect([...canvasElement.querySelectorAll('dd')].map((dd) => dd.textContent)).toEqual([
			counts.format(0),
			counts.format(0),
			millis.format(0),
			'',
		]);
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
