import type { LayoutServerLoad } from './$types';
import { recursiveScan, isBoxAdguard, type Config } from '$lib/utils/config';
import { type GetAdguardStatsOutput, $getAdguardStats } from '$lib/data/repository/adguard';

export const load: LayoutServerLoad = async (event) => {
	let adguard: GetAdguardStatsOutput | null = null;
	let config: Config = {};

	try {
		const rawConfig = await event.fetch('/config.json');
		config = await rawConfig.json();

		const adguardContainer = recursiveScan(config, 'BoxAdguard');

		if (adguardContainer && isBoxAdguard(adguardContainer)) {
			const [err, res] = await $getAdguardStats({
				username: 'shadi',
				password: 'jpwqc6Zfu9o$Au#a$@xV',
				href: adguardContainer.props.href
			});

			if (err) {
				console.log('Adguard fetch error:', err);
			}

			adguard = res;
		}
	} catch (err) {
		console.log(err);
	}

	return {
		adguard,
		config
	};
};
