import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
	stat: vi.fn(),
	readFile: vi.fn(),
	writeFile: vi.fn(),
	rename: vi.fn(),
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		DASHBOARD_CONFIG: '/etc/dashboard.json',
	},
}));

/** Only the calls the module makes, so the mocks need no casting per call. */
type FsMock = {
	stat: Mock<(path: string) => Promise<{ mtimeMs: number; size: number }>>;
	readFile: Mock<(path: string, encoding: string) => Promise<string>>;
	writeFile: Mock<(path: string, text: string, encoding: string) => Promise<void>>;
	rename: Mock<(from: string, to: string) => Promise<void>>;
};

const file = JSON.stringify({
	pages: {
		'/': {
			name: 'Home',
			containers: [
				{
					name: 'BoxDate',
				},
			],
		},
	},
});

/**
 * The module caches by mtime, so every test needs its own instance of it — and its
 * own instance of the mocked fs, which `resetModules` recreates along with it.
 */
async function loadModule() {
	vi.resetModules();

	const fs = (await import('node:fs/promises')) as unknown as FsMock;
	const { readConfig, writeConfig } = await import('$lib/business/model/config-source');

	return {
		fs,
		readConfig,
		writeConfig,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('readConfig', () => {
	it('reads the path from the environment and normalizes the file', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({
			mtimeMs: 1,
			size: 10,
		});

		fs.readFile.mockResolvedValue(file);

		const { config, error, mtimeMs, isFresh } = await readConfig();

		expect(fs.stat).toHaveBeenCalledWith('/etc/dashboard.json');

		expect(config.pages['/'].containers).toEqual([
			{
				name: 'BoxDate',
				props: {},
			},
		]);

		expect(error).toBeNull();
		expect(mtimeMs).toBe(1);
		expect(isFresh).toBe(true);
	});

	it('serves the cached config while the file is unchanged', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({
			mtimeMs: 1,
			size: 10,
		});

		fs.readFile.mockResolvedValue(file);

		await readConfig();

		expect((await readConfig()).isFresh).toBe(false);
		expect(fs.readFile).toHaveBeenCalledOnce();
	});

	it('re-reads the file once its mtime changes', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({
			mtimeMs: 1,
			size: 10,
		});

		fs.readFile.mockResolvedValue(file);

		await readConfig();

		fs.stat.mockResolvedValue({
			mtimeMs: 2,
			size: 10,
		});

		await readConfig();

		expect(fs.readFile).toHaveBeenCalledTimes(2);
	});

	// A restore that preserves timestamps, or two edits inside one coarse mtime tick.
	it('re-reads the file when its size changes but its mtime does not', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({
			mtimeMs: 1,
			size: 10,
		});

		fs.readFile.mockResolvedValue(file);

		await readConfig();

		fs.stat.mockResolvedValue({
			mtimeMs: 1,
			size: 11,
		});

		await readConfig();

		expect(fs.readFile).toHaveBeenCalledTimes(2);
	});

	it('keeps serving the last good config when a later read fails', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({
			mtimeMs: 1,
			size: 10,
		});

		fs.readFile.mockResolvedValue(file);

		const { config: first } = await readConfig();

		fs.stat.mockRejectedValue(new Error('ENOENT'));

		const failed = await readConfig();

		expect(failed.config).toBe(first);
		expect(failed.error?.message).toContain('ENOENT');
		expect(failed.mtimeMs).toBeNull();
	});

	it('falls back to an empty config when the file was never readable', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockRejectedValue(new Error('ENOENT'));

		expect((await readConfig()).config).toEqual({
			pages: {},
		});
	});

	// The stat failure has no stamp to be cached against, so the retained message is
	// what keeps an unreachable config from reporting itself on every single request.
	it('reports an unreachable config once, not once per request', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockRejectedValue(new Error('ENOENT'));

		expect((await readConfig()).isFresh).toBe(true);
		expect((await readConfig()).isFresh).toBe(false);
	});

	it('reads a broken file once per mtime, and again once it is fixed', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({
			mtimeMs: 1,
			size: 10,
		});

		fs.readFile.mockResolvedValue('{ not json');

		expect((await readConfig()).isFresh).toBe(true);

		const cached = await readConfig();

		expect(fs.readFile).toHaveBeenCalledOnce();
		expect(cached.isFresh).toBe(false);
		// Retained beside the cache, so /api/health still answers 503 on the cache hit.
		expect(cached.error?.message).toContain('/etc/dashboard.json');

		fs.stat.mockResolvedValue({
			mtimeMs: 2,
			size: 10,
		});

		fs.readFile.mockResolvedValue(file);

		expect((await readConfig()).config.pages['/'].name).toBe('Home');
	});

	it('falls back to an empty config when the file is not valid JSON', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({
			mtimeMs: 1,
			size: 10,
		});

		fs.readFile.mockResolvedValue('{ not json');

		expect((await readConfig()).config).toEqual({
			pages: {},
		});
	});

	it('hands back the warnings normalization produced instead of printing them', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({
			mtimeMs: 1,
			size: 10,
		});

		fs.readFile.mockResolvedValue(
			JSON.stringify({
				pages: {
					'/': {
						containers: [
							{
								name: 'NotAComponent',
							},
						],
					},
				},
			}),
		);

		expect((await readConfig()).warnings).toEqual([expect.stringContaining('NotAComponent')]);
	});
});

describe('writeConfig', () => {
	// `defaults` is the half a re-serialized `Config` would silently destroy: it is
	// consumed during normalization, so it exists in the file and nowhere downstream.
	const submitted = JSON.stringify(
		{
			defaults: {
				BoxService: {
					span: 6,
				},
			},
			pages: {
				'/': {
					containers: [],
				},
			},
		},
		null,
		2,
	);

	it('writes the submitted text verbatim, through a temp file it then renames', async () => {
		const { fs, writeConfig } = await loadModule();
		const { rejection } = await writeConfig(submitted);

		expect(rejection).toBeNull();
		expect(fs.writeFile).toHaveBeenCalledWith('/etc/dashboard.json.tmp', submitted, 'utf8');
		expect(fs.rename).toHaveBeenCalledWith('/etc/dashboard.json.tmp', '/etc/dashboard.json');

		// The rename is what makes the write atomic, so it has to come second: the temp
		// file exists to be the only thing a torn write can truncate.
		expect(fs.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
			fs.rename.mock.invocationCallOrder[0],
		);
	});

	it('refuses text that is not JSON, and touches nothing', async () => {
		const { fs, writeConfig } = await loadModule();

		expect(await writeConfig('{ not json')).toEqual({
			rejection: 'invalid-json',
			warnings: [],
		});

		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	// Valid JSON that `normalizeConfig` accepts in silence — no warning to reject on —
	// so without its own guard this writes and blanks the dashboard.
	it.each(['[]', '"a config"', 'null'])('refuses %s, which is not a config', async (text) => {
		const { fs, writeConfig } = await loadModule();

		expect(await writeConfig(text)).toEqual({
			rejection: 'not-an-object',
			warnings: [],
		});

		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	// Rejected rather than written-and-warned: a warning names a container that would
	// have been dropped, so the operator gets told instead of losing the box.
	it('refuses a config that would drop a container, and hands back the diagnostics', async () => {
		const { fs, writeConfig } = await loadModule();

		const { rejection, warnings } = await writeConfig(
			JSON.stringify({
				pages: {
					'/': {
						containers: [
							{
								name: 'BoxService',
								props: {
									title: 'No href',
								},
							},
						],
					},
				},
			}),
		);

		expect(rejection).toBe('warnings');
		expect(warnings).toEqual([expect.stringContaining('Skipping container "BoxService"')]);
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it('reports a failed write as a value', async () => {
		const { fs, writeConfig } = await loadModule();

		fs.writeFile.mockRejectedValue(new Error('EACCES'));

		expect(await writeConfig(submitted)).toEqual({
			rejection: 'write-failed',
			warnings: [],
		});

		expect(fs.rename).not.toHaveBeenCalled();
	});
});
