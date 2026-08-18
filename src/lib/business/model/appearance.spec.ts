import { describe, expect, it } from 'vitest';
import { readOrMintScenerySeed } from '$lib/business/model/appearance';

/** A server cookie jar that records what was written, so a mint is observable. */
function cookieJar(entries: Record<string, string>) {
	const writes: string[] = [];

	return {
		writes,
		get: (name: string) => entries[name],
		set: (name: string, value: string) => {
			entries[name] = value;
			writes.push(value);
		},
	};
}

describe('readOrMintScenerySeed', () => {
	it('keeps a stored seed and writes nothing', () => {
		const jar = cookieJar({
			scenerySeed: '7',
		});

		expect(readOrMintScenerySeed(jar)).toBe(7);
		expect(jar.writes).toEqual([]);
	});

	it('mints once and persists it, so the next read returns the same seed', () => {
		const jar = cookieJar({});
		const minted = readOrMintScenerySeed(jar);

		expect(jar.writes).toEqual([String(minted)]);
		expect(readOrMintScenerySeed(jar)).toBe(minted);
	});
});
