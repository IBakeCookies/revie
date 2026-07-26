import type { AdguardStats } from '$lib/business/type/adguard-stats';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BoxAdguard from '$lib/components/box-adguard.svelte';
import { m } from '$lib/paraglide/messages';
import { spanOf } from '$lib/test/dom';

const href = 'http://adguard.local';

const stats: AdguardStats = {
	dnsQueries: 1234,
	numBlockedFiltering: 56,
	avgProcessingTimeMs: 12,
	topBlockedDomain: 'ads.example.com'
};

describe('box-adguard.svelte', () => {
	it('links to the AdGuard instance without leaking the dashboard as referrer', async () => {
		const screen = render(BoxAdguard, { href, stats });
		const link = screen.getByRole('link');

		await expect.element(link).toHaveAttribute('href', href);
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noreferrer');
	});

	it('shows every stat in the current language', async () => {
		const screen = render(BoxAdguard, { href, stats });

		await expect
			.element(screen.getByText(m.adguard_dns_queries({ count: 1234 })))
			.toBeInTheDocument();
		await expect
			.element(screen.getByText(m.adguard_blocked({ count: 56 })))
			.toBeInTheDocument();
		await expect
			.element(screen.getByText(m.adguard_delay({ milliseconds: 12 })))
			.toBeInTheDocument();
		await expect
			.element(
				screen.getByText(m.adguard_top_blocked_domain({ domain: 'ads.example.com' }), {
					exact: true
				})
			)
			.toBeInTheDocument();
	});

	it('renders an empty box when AdGuard could not be reached', () => {
		const screen = render(BoxAdguard, { href });

		expect(screen.container.querySelectorAll('p')).toHaveLength(0);
	});

	it('passes the column span as a custom property', () => {
		const screen = render(BoxAdguard, { href, stats, span: 4 });

		expect(spanOf(screen.container)).toBe('4');
	});
});
