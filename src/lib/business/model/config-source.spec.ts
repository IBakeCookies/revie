import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
	stat: vi.fn(),
	readFile: vi.fn(),
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		DASHBOARD_CONFIG: '/etc/dashboard.json',
	},
}));

/** Only the two calls the module makes, so the mocks need no casting per call. */
type FsMock = {
	stat: Mock<(path: string) => Promise<{ mtimeMs: number; size: number }>>;
	readFile: Mock<(path: string, encoding: string) => Promise<string>>;
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
	const { readConfig } = await import('$lib/business/model/config-source');

	return {
		fs,
		readConfig,
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
