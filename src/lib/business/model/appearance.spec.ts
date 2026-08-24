import { describe, expect, it } from 'vitest';
import { readOrMintScenerySeed, readRequestAppearance } from '$lib/business/model/appearance';
import { DEFAULT_THEME, getClassesToAdd } from '$lib/business/model/theme';

/** A server cookie jar that records what was written, so a mint is observable. */
function cookieJar(entries: Record<string, string>) {
	const writes: { value: string; secure: boolean }[] = [];

	return {
		writes,
		get: (name: string) => entries[name],
		set: (name: string, value: string, options: { secure: boolean }) => {
			entries[name] = value;

			writes.push({
				value,
				secure: options.secure,
			});
		},
	};
}

const plainHttp = new URL('http://dashboard.lan/');

describe('readOrMintScenerySeed', () => {
	it('keeps a stored seed and writes nothing', () => {
		const jar = cookieJar({
			scenerySeed: '7',
		});

		expect(readOrMintScenerySeed(jar, plainHttp)).toBe(7);
		expect(jar.writes).toEqual([]);
	});

	it('mints once and persists it, so the next read returns the same seed', () => {
		const jar = cookieJar({});
		const minted = readOrMintScenerySeed(jar, plainHttp);

		expect(jar.writes).toEqual([
			{
				value: String(minted),
				secure: false,
			},
		]);

		expect(readOrMintScenerySeed(jar, plainHttp)).toBe(minted);
	});

	it('mints a Secure cookie for an https request and a plain one for http', () => {
		const secureJar = cookieJar({});
		const plainJar = cookieJar({});

		readOrMintScenerySeed(secureJar, new URL('https://dashboard.lan/'));
		readOrMintScenerySeed(plainJar, plainHttp);

		expect(secureJar.writes[0].secure).toBe(true);
		expect(plainJar.writes[0].secure).toBe(false);
	});
});

describe('readRequestAppearance', () => {
	it('resolves a stored theme that still exists', () => {
		const jar = cookieJar({
			theme: 'aurora',
		});

		const read = readRequestAppearance(jar);

		expect(read.theme).toBe('aurora');
		expect(read.themeClass).toBe(getClassesToAdd('aurora').join(' '));
	});

	it('falls through to the default when the cookie names a deleted theme', () => {
		const jar = cookieJar({
			theme: 'theme-removed-two-deploys-ago',
		});

		const read = readRequestAppearance(jar);

		// Casting instead of resolving leaves a stale cookie naming no CSS
		// classes at all, and the app renders unstyled.
		expect(read.theme).toBeUndefined();
		expect(read.themeClass).toBe(getClassesToAdd(DEFAULT_THEME).join(' '));
	});
});
