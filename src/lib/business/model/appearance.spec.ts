import { afterEach, describe, expect, it, vi } from 'vitest';
import { readClientAppearance, readOrMintScenerySeed } from '$lib/business/model/appearance';

/** The browser jar the client reader parses. Node has no `document` of its own. */
function stubDocumentCookie(cookie: string): void {
	vi.stubGlobal('document', {
		cookie,
	});
}

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

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('readClientAppearance', () => {
	it('hands back all three preferences from the browser jar', () => {
		stubDocumentCookie('theme=abyss; scenerySeed=7; sceneryMotion=paused');

		expect(readClientAppearance()).toEqual({
			theme: 'abyss',
			scenerySeed: 7,
			sceneryPaused: true,
		});
	});

	it('drops a theme that is no longer in the catalogue', () => {
		stubDocumentCookie('theme=theme-removed-two-deploys-ago');

		// Cookies outlive deploys. Passing the raw name through leaves the caller
		// naming no CSS classes at all, and the app renders unstyled.
		expect(readClientAppearance().theme).toBeUndefined();
	});

	it('leaves an absent seed undefined rather than minting one', () => {
		stubDocumentCookie('theme=abyss');

		// Minting is the server's job — a second mint would shift the scenery
		// between the SSR'd style attribute and the hydrated one.
		expect(readClientAppearance().scenerySeed).toBeUndefined();
	});
});

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
