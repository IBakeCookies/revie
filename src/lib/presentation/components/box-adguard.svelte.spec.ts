import type { AdguardStats } from '$lib/business/type/adguard-stats';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BoxAdguard from '$lib/presentation/components/box-adguard.svelte';
import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import { spanOf } from '$lib/test/dom';

const href = 'http://adguard.local';

const stats: AdguardStats = {
	dnsQueries: 1234,
	numBlockedFiltering: 56,
	avgProcessingTimeMs: 12,
	topBlockedDomain: 'ads.example.com',
};

describe('box-adguard.svelte', () => {
	it('links to the AdGuard instance without leaking the dashboard as referrer', async () => {
		const screen = await render(BoxAdguard, {
			href,
			stats,
		});

		const link = screen.getByRole('link');

		await expect.element(link).toHaveAttribute('href', href);
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noreferrer');
	});

	it('shows every stat in the current language', async () => {
		const screen = await render(BoxAdguard, {
			href,
			stats,
		});

		// Built from the same locale the component reads, so a render in the wrong locale
		// cannot pass by matching a hardcoded string.
		const counts = new Intl.NumberFormat(getLocale());

		const millis = new Intl.NumberFormat(getLocale(), {
			style: 'unit',
			unit: 'millisecond',
			unitDisplay: 'narrow',
		});

		const tiles = [...screen.container.querySelectorAll('dl > div')];

		expect(
			tiles.map((tile) => [
				tile.querySelector('dt')?.textContent,
				tile.querySelector('dd')?.textContent,
			]),
		).toEqual([
			[m.adguard_dns_queries(), counts.format(stats.dnsQueries)],
			[m.adguard_blocked(), counts.format(stats.numBlockedFiltering)],
			[m.adguard_delay(), millis.format(stats.avgProcessingTimeMs)],
			[m.adguard_top_blocked_domain(), stats.topBlockedDomain],
		]);
	});

	it('says so when AdGuard could not be reached', async () => {
		const screen = await render(BoxAdguard, {
			href,
		});

		const readings = screen.container.querySelectorAll('p');

		expect(readings).toHaveLength(1);
		expect(readings[0]).toHaveTextContent(m.adguard_unavailable());
	});

	it('passes the column span as a custom property', async () => {
		const screen = await render(BoxAdguard, {
			href,
			stats,
			span: 4,
		});

		expect(spanOf(screen.container)).toBe('4');
	});
});
