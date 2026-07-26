import type { PageServerLoad } from './$types';
import type { AdguardStats } from '$lib/business/type/adguard-stats';
import type { ConfigPage } from '$lib/business/config';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { findContainer, isBoxAdguard } from '$lib/business/config';
import { getAdguardStats } from '$lib/data/repository/adguard';
import { readConfig } from '$lib/business/config-source';
import { transformAdguardStats } from '$lib/business/transform/adguard-transform';

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

	const [err, stats] = await getAdguardStats({
		username: ADGUARD_USERNAME,
		password: ADGUARD_PASSWORD,
		href: container.props.href
	});

	if (err) {
		console.error('AdGuard stats could not be read:', err);

		return null;
	}

	return transformAdguardStats(stats);
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
