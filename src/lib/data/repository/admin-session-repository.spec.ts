import { describe, expect, it, vi } from 'vitest';
import {
	$createAdminSessionCookie,
	$deleteAdminSessionCookie,
	$readAdminSession,
} from '$lib/data/repository/admin-session-repository';

vi.mock('$app/environment', () => ({
	dev: true,
}));

/** Stands in for `event.cookies` — the read path's whole contract. */
const from = (jar: Record<string, string>) => ({
	get: (name: string) => jar[name],
});

describe('$readAdminSession', () => {
	it('reads the session cookie out of a source', () => {
		expect(
			$readAdminSession(
				from({
					adminSession: 'a-token',
				}),
			),
		).toBe('a-token');
	});

	it('passes an unknown value through — judging it is the model’s job', () => {
		expect($readAdminSession(from({}))).toBeUndefined();
	});
});

describe('admin session writes', () => {
	it('writes the cookie with attributes the browser cannot read or send cross-site', () => {
		const sink = {
			set: vi.fn(),
			delete: vi.fn(),
		};

		$createAdminSessionCookie(sink, 'a-token');

		// `secure` follows the build — this file mocks `dev: true`, so it is false
		// here and true in a production bundle.
		expect(sink.set).toHaveBeenCalledWith('adminSession', 'a-token', {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: false,
		});
	});

	it('clears the cookie on the same path it was written to', () => {
		const sink = {
			set: vi.fn(),
			delete: vi.fn(),
		};

		$deleteAdminSessionCookie(sink);

		expect(sink.delete).toHaveBeenCalledWith('adminSession', {
			path: '/',
		});
	});
});
