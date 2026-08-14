import type { PageServerLoad } from './$types';
import type { AdguardStats } from '$lib/business/type/adguard-stats';
import type { ConfigPage } from '$lib/business/model/config';
import type { Result } from '$lib/utils/useAsyncErrorAsValue';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { findContainer, isBoxAdguard } from '$lib/business/model/config';
import { readAdguardStats } from '$lib/business/model/adguard';
import { readConfig } from '$lib/business/model/config-source';

/**
 * `[null, null]` is "no box configured, or no credentials to read it with" — an
 * absence rather than a failure, so nothing is reported to the person looking at
 * the page. Only a box that was asked and did not answer produces an error.
 */
async function loadAdguardStats(page: ConfigPage): Promise<Result<AdguardStats | null>> {
	const container = findContainer(page, 'BoxAdguard');

	if (!container || !isBoxAdguard(container)) {
		return [null, null];
	}

	const { ADGUARD_USERNAME, ADGUARD_PASSWORD } = env;

	if (!ADGUARD_USERNAME || !ADGUARD_PASSWORD) {
		console.warn('ADGUARD_USERNAME / ADGUARD_PASSWORD are not set, skipping AdGuard stats');

		return [null, null];
	}

	const [err, stats] = await readAdguardStats({
		username: ADGUARD_USERNAME,
		password: ADGUARD_PASSWORD,
		href: container.props.href,
	});

	// Logged AND returned, and the two carry different things. The log is the operator
	// channel: it names the host and the status, and outlives the tab. Both halves are
	// already in `err.message` — the repository passes the href as the context
	// `useAsyncErrorAsValue` prefixes — so prefixing it again here printed the host
	// twice. What crosses to the page is only THAT it failed: the route turns that into
	// a translated line, because `err.message` is English minted in `data`. Not
	// `err.cause` in either: a bounded fetch's timeout arrives as a DOMException whose
	// stack is ten frames of undici internals naming neither AdGuard nor the host.
	if (err) {
		console.error(err.message);

		return [err, null];
	}

	return [null, stats];
}

export const load: PageServerLoad = async ({ url }) => {
	const { config, warnings, error: configError, isFresh } = await readConfig();

	// Only what the file re-read actually turned up, so a broken config costs one log
	// per mtime instead of one per request. Two concurrent first hits can still log
	// twice; an in-flight promise cache to dedupe that race is more machinery than one
	// duplicate pair is worth.
	if (isFresh) {
		if (configError) {
			console.error(configError.message, configError.cause ?? '');
		}

		for (const warning of warnings) {
			console.warn(warning);
		}
	}

	const page = config.pages[url.pathname];

	// A config that could not be read is not a wrong URL. Answering 404 for it blamed
	// the address bar for a file the server could not open, which is the one thing the
	// operator needed to be told.
	if (!page && configError) {
		error(503, 'The dashboard config could not be read');
	}

	if (!page) {
		error(404, `No dashboard page is configured for "${url.pathname}"`);
	}

	const [adguardError, adguard] = await loadAdguardStats(page);

	return {
		containers: page.containers,
		adguard,
		// A flag, not the message: the words belong to presentation, which has the
		// locale. One flag rather than a kind union because the only distinction worth
		// drawing — bad credentials vs. a box that is switched off — is already in the
		// log line above, and a user reads the same sentence either way.
		adguardFailed: adguardError !== null,
	};
};
