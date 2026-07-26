import type { PageServerLoad } from './$types';
import type { AdguardStats } from '$lib/business/type/adguard-stats';
import type { ConfigPage } from '$lib/business/model/config';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { findContainer, isBoxAdguard } from '$lib/business/model/config';
import { readAdguardStats } from '$lib/business/model/adguard';
import { readConfig } from '$lib/business/model/config-source';

async function loadAdguardStats(page: ConfigPage): Promise<AdguardStats | null> {
	const container = findContainer(page, 'BoxAdguard');

	if (!container || !isBoxAdguard(container)) {
		return null;
	}

	const { ADGUARD_USERNAME, ADGUARD_PASSWORD } = env;

	if (!ADGUARD_USERNAME || !ADGUARD_PASSWORD) {
		console.warn('ADGUARD_USERNAME / ADGUARD_PASSWORD are not set, skipping AdGuard stats');

		return null;
	}

	const [err, stats] = await readAdguardStats({
		username: ADGUARD_USERNAME,
		password: ADGUARD_PASSWORD,
		href: container.props.href
	});

	// The box renders empty rather than the page failing; the error is logged here
	// because nothing forwards it to the client yet (see the toast roadmap item).
	if (err) {
		console.error(err.message, err.cause ?? '');

		return null;
	}

	return stats;
}

export const load: PageServerLoad = async ({ url }) => {
	const config = await readConfig();
	const page = config.pages[url.pathname];

	if (!page) {
		error(404, `No dashboard page is configured for "${url.pathname}"`);
	}

	return {
		containers: page.containers,
		adguard: await loadAdguardStats(page)
	};
};
