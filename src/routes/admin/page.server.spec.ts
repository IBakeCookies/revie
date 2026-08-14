import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ConfigSource from '$lib/business/model/config-source';
import { containerFields } from '$lib/business/model/config';
import { readConfigText } from '$lib/business/model/config-source';
import { load } from './+page.server';

// Only the disk read is stubbed. The real `needsRawEditor` and the real `normalizeConfig`
// have to run, because whether the form can represent a file is exactly what is under
// test — hence the spread rather than a whole-module fake, and hence the mock at the
// business boundary rather than at `$lib/data`, which a route may not name.
vi.mock('$lib/business/model/config-source', async (importOriginal) => ({
	...(await importOriginal<typeof ConfigSource>()),
	readConfigText: vi.fn(),
}));

vi.mock('$env/dynamic/private', () => ({
	env: {},
}));

const readsText = readConfigText as Mock<typeof readConfigText>;
/** The load takes no arguments; the guard in hooks.server.ts has already run. */
const event = {} as Parameters<typeof load>[0];

function onDisk(text: string) {
	readsText.mockResolvedValue([null, text]);
}

beforeEach(() => {
	vi.resetAllMocks();
});

describe('the admin load', () => {
	it('offers the generated form for a config it can represent', async () => {
		onDisk(
			JSON.stringify({
				defaults: {
					BoxService: {
						span: 6,
					},
				},
				pages: {
					'/': {
						containers: [
							{
								name: 'BoxDate',
							},
						],
					},
				},
			}),
		);

		expect(await load(event)).toMatchObject({
			needsRawEditor: false,
			readFailed: false,
			// The file's own bytes, `defaults` and all — not the normalized config.
			text: expect.stringContaining('"defaults"'),
			// The schema-walked descriptions the form is generated from, unchanged.
			containerFields,
		});
	});

	// The three dead ends the flag exists for, and the reason it is one predicate: a warning
	// is precisely what refuse-on-warnings makes unsavable, and the form can show none of
	// it, so the operator would be stuck with no way to reach what is blocking the save.
	it('falls back to raw text for a file that is not JSON', async () => {
		onDisk('{ "pages": ');

		expect(await load(event)).toMatchObject({
			needsRawEditor: true,
		});
	});

	it('falls back to raw text for JSON that is not an object', async () => {
		onDisk('[]');

		expect(await load(event)).toMatchObject({
			needsRawEditor: true,
		});
	});

	it('falls back to raw text for a config that normalizes with a warning', async () => {
		onDisk(
			JSON.stringify({
				pages: {
					'/': {
						containers: [
							{
								name: 'NotAContainer',
							},
						],
					},
				},
			}),
		);

		expect(await load(event)).toMatchObject({
			needsRawEditor: true,
		});
	});

	it('falls back to raw text when the file cannot be read at all', async () => {
		readsText.mockResolvedValue([
			{
				message: 'EACCES',
				cause: undefined,
			},
			null,
		]);

		// An empty editor over an unreadable file is a form that would overwrite it.
		expect(await load(event)).toMatchObject({
			readFailed: true,
			needsRawEditor: true,
		});
	});
});
