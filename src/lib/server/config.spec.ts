import type { Mock } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({ stat: vi.fn(), readFile: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({ env: { DASHBOARD_CONFIG: '/etc/dashboard.json' } }));

/** Only the two calls the module makes, so the mocks need no casting per call. */
type FsMock = {
	stat: Mock<(path: string) => Promise<{ mtimeMs: number }>>;
	readFile: Mock<(path: string, encoding: string) => Promise<string>>;
};

const file = JSON.stringify({
	pages: {
		'/': { name: 'Home', containers: [{ name: 'BoxDate' }] }
	}
});

/**
 * The module caches by mtime, so every test needs its own instance of it — and its
 * own instance of the mocked fs, which `resetModules` recreates along with it.
 */
async function loadModule() {
	vi.resetModules();

	const fs = (await import('node:fs/promises')) as unknown as FsMock;
	const { readConfig } = await import('$lib/server/config');

	return { fs, readConfig };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('readConfig', () => {
	it('reads the path from the environment and normalizes the file', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({ mtimeMs: 1 });
		fs.readFile.mockResolvedValue(file);

		const config = await readConfig();

		expect(fs.stat).toHaveBeenCalledWith('/etc/dashboard.json');
		expect(config.pages['/'].containers).toEqual([{ name: 'BoxDate', props: {} }]);
	});

	it('serves the cached config while the file is unchanged', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({ mtimeMs: 1 });
		fs.readFile.mockResolvedValue(file);

		await readConfig();
		await readConfig();

		expect(fs.readFile).toHaveBeenCalledOnce();
	});

	it('re-reads the file once its mtime changes', async () => {
		const { fs, readConfig } = await loadModule();

		fs.stat.mockResolvedValue({ mtimeMs: 1 });
		fs.readFile.mockResolvedValue(file);

		await readConfig();

		fs.stat.mockResolvedValue({ mtimeMs: 2 });

		await readConfig();

		expect(fs.readFile).toHaveBeenCalledTimes(2);
	});

	it('keeps serving the last good config when a later read fails', async () => {
		const { fs, readConfig } = await loadModule();

		vi.spyOn(console, 'error').mockImplementation(() => {});
		fs.stat.mockResolvedValue({ mtimeMs: 1 });
		fs.readFile.mockResolvedValue(file);

		const first = await readConfig();

		fs.stat.mockRejectedValue(new Error('ENOENT'));

		expect(await readConfig()).toBe(first);
	});

	it('falls back to an empty config when the file was never readable', async () => {
		const { fs, readConfig } = await loadModule();

		vi.spyOn(console, 'error').mockImplementation(() => {});
		fs.stat.mockRejectedValue(new Error('ENOENT'));

		expect(await readConfig()).toEqual({ pages: {} });
	});

	it('falls back to an empty config when the file is not valid JSON', async () => {
		const { fs, readConfig } = await loadModule();

		vi.spyOn(console, 'error').mockImplementation(() => {});
		fs.stat.mockResolvedValue({ mtimeMs: 1 });
		fs.readFile.mockResolvedValue('{ not json');

		expect(await readConfig()).toEqual({ pages: {} });
	});
});
