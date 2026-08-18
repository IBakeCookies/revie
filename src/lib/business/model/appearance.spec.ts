import { describe, expect, it } from 'vitest';
import { readOrMintScenerySeed } from '$lib/business/model/appearance';

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
