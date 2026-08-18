import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
	$createScenerySeedCookie,
	$readAppearance,
	$updateSceneryMotion,
	$updateScenerySeed,
	$updateTheme,
} from '$lib/data/repository/appearance-repository';

/** Stands in for `event.cookies` (server) — the read path's whole contract. */
const from = (jar: Record<string, string>) => ({
	get: (name: string) => jar[name],
});

describe('$readAppearance', () => {
	it('reads all three cookies out of a source', () => {
		expect(
			$readAppearance(
				from({
					theme: 'abyss',
					scenerySeed: '42',
					sceneryMotion: 'paused',
				}),
			),
		).toEqual({
			theme: 'abyss',
			scenerySeed: 42,
			sceneryPaused: true,
		});
	});

	it('reports an empty jar as "nothing recorded" rather than defaults', () => {
		// undefined is load-bearing: it lets the client fall back to the OS
		// preference, which `false` would silently override.
		expect($readAppearance(from({}))).toEqual({
			theme: undefined,
			scenerySeed: undefined,
			sceneryPaused: undefined,
		});
	});

	it('maps only the two known motion values, not any truthy string', () => {
		expect(
			$readAppearance(
				from({
					sceneryMotion: 'on',
				}),
			).sceneryPaused,
		).toBe(false);

		expect(
			$readAppearance(
				from({
					sceneryMotion: 'yes',
				}),
			).sceneryPaused,
		).toBeUndefined();
	});

	it('rejects a malformed seed so the caller mints a fresh one', () => {
		for (const seed of ['abc', '-1', '1.5', '']) {
			expect(
				$readAppearance(
					from({
						scenerySeed: seed,
					}),
				).scenerySeed,
			).toBeUndefined();
		}
	});

	it('passes an unknown theme through — validating it is the model’s job', () => {
		expect(
			$readAppearance(
				from({
					theme: 'deleted-theme',
				}),
			).theme,
		).toBe('deleted-theme');
	});
});

describe('appearance writes', () => {
	let written: string[];

	beforeEach(() => {
		written = [];

		vi.stubGlobal('document', {
			set cookie(value: string) {
				written.push(value);
			},
		});

		vi.stubGlobal('location', {
			protocol: 'http:',
		});
	});

	afterEach(() => vi.unstubAllGlobals());

	it('writes each cookie with the shared attributes, and Secure only on https', () => {
		vi.stubGlobal('location', {
			protocol: 'https:',
		});

		$updateTheme('abyss');

		vi.stubGlobal('location', {
			protocol: 'http:',
		});

		$updateTheme('abyss');

		// Secure on a plain-http deployment has the browser drop the cookie outright.
		expect(written).toEqual([
			'theme=abyss; path=/; max-age=31536000; SameSite=lax; Secure',
			'theme=abyss; path=/; max-age=31536000; SameSite=lax',
		]);
	});

	it('serializes the seed and the motion flag to what the reader expects', () => {
		$updateScenerySeed(4294967295);
		$updateSceneryMotion(true);
		$updateSceneryMotion(false);

		expect(written[0]).toContain('scenerySeed=4294967295');
		expect(written[1]).toContain('sceneryMotion=paused');
		expect(written[2]).toContain('sceneryMotion=on');
	});

	it('mints the seed server-side with the same attributes', () => {
		const sink = {
			set: vi.fn(),
		};

		$createScenerySeedCookie(sink, 99, false);

		expect(sink.set).toHaveBeenCalledWith('scenerySeed', '99', {
			path: '/',
			maxAge: 31536000,
			sameSite: 'lax',
			httpOnly: false,
			secure: false,
		});
	});

	it('marks the minted cookie Secure when the caller asks for it', () => {
		const sink = {
			set: vi.fn(),
		};

		$createScenerySeedCookie(sink, 99, true);

		expect(sink.set).toHaveBeenCalledWith(
			'scenerySeed',
			'99',
			expect.objectContaining({
				secure: true,
			}),
		);
	});
});
