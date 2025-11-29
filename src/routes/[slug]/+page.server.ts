import type { PageServerLoad } from './$types';
import { recursiveScan, isBoxAdguard } from '$lib/utils/config';
import { type GetAdguardStatsOutput, getAdguardStats } from '$lib/data/repository/adguard';

export const load: PageServerLoad = async (event) => {
	let adguard: GetAdguardStatsOutput | null = null;
	const parent = await event.parent();
	const pathname = event.url.pathname;
	const page = parent.config.pages?.[pathname];

	if (page) {
		const adguardContainer = recursiveScan(page, 'BoxAdguard');

		if (adguardContainer && isBoxAdguard(adguardContainer)) {
			const [err, res] = await getAdguardStats({
				username: 'shadi',
				password: 'jpwqc6Zfu9o$Au#a$@xV',
				href: adguardContainer.props.href
			});

			if (err) {
				console.log('Adguard fetch error:', err);
			}

			adguard = res;
		}
	}

	return {
		adguard
	};
};
