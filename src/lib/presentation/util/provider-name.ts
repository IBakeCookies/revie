import type { ProviderName } from '$lib/business/model/config';

/**
 * What a user reads in place of the config's token.
 *
 * Deliberately NOT paraglide messages: these are product names, identical in every
 * locale, and putting them in both catalogues would offer a translator strings they must
 * not touch. The SENTENCE around one is a message and takes the name as a parameter —
 * the same seam `service_probe_failed({ href })` uses, and the same rule: a name is data,
 * the words around it are presentation's.
 *
 * Complete over `ProviderName`, so a provider added to the schema has to be named here
 * before this compiles.
 */
export const providerNameLabel: Record<ProviderName, string> = {
	adguard: 'AdGuard Home',
	'pihole-v5': 'Pi-hole v5',
	'pihole-v6': 'Pi-hole v6',
	'uptime-kuma': 'Uptime Kuma',
	proxmox: 'Proxmox VE',
	'open-meteo': 'Open-Meteo',
	jellyfin: 'Jellyfin',
};
