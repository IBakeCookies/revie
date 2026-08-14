import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import type * as AdminAuth from '$lib/business/model/admin-auth';
import { signInAdmin } from '$lib/business/model/admin-auth';
import { actions } from './+page.server';

// Mocked at the business boundary — a route may not name `$lib/data`, and what is under
// test is the action's own branching, not the counter's arithmetic (that is
// admin-auth.spec.ts). The `locked` wiring has no e2e by design: one preview server serves
// the whole playwright run from one address, so a lockout there would poison whichever
// admin spec ran next. This is its only cover.
vi.mock('$lib/business/model/admin-auth', async (importOriginal) => ({
	...(await importOriginal<typeof AdminAuth>()),
	signInAdmin: vi.fn(),
}));

vi.mock('$env/dynamic/private', () => ({
	env: {},
}));

const signsIn = signInAdmin as Mock<typeof signInAdmin>;
const CLIENT_ADDRESS = '203.0.113.7';

const submitting = (form: Map<string, string>) =>
	({
		cookies: {
			set: vi.fn(),
		},
		getClientAddress: () => CLIENT_ADDRESS,
		request: {
			formData: async () => form,
		},
	}) as unknown as Parameters<typeof actions.default>[0];

/** The action THROWS its redirect, so the success case is caught rather than returned. */
async function submit(token: string) {
	try {
		return await actions.default(submitting(new Map([['token', token]])));
	} catch (thrown) {
		return thrown;
	}
}

beforeEach(() => {
	vi.resetAllMocks();
});

describe('the login action', () => {
	it('redirects to the admin area on a successful sign-in', async () => {
		signsIn.mockReturnValue({
			status: 'signed-in',
		});

		const thrown = await submit('the-token');

		expect(isRedirect(thrown) && thrown.status).toBe(303);
		expect(isRedirect(thrown) && thrown.location).toBe('/admin');
	});

	// The address is what the counter is keyed on, so it has to be the request's own.
	it('hands the client address to signInAdmin', async () => {
		signsIn.mockReturnValue({
			status: 'signed-in',
		});

		await submit('the-token');

		expect(signsIn).toHaveBeenCalledWith(expect.anything(), 'the-token', CLIENT_ADDRESS);
	});

	it('fails 401 with a flag on a rejected token', async () => {
		signsIn.mockReturnValue({
			status: 'rejected',
		});

		expect(await submit('wrong')).toMatchObject({
			status: 401,
			data: {
				invalid: true,
			},
		});
	});

	// The status as well as the body: 429 is the half a caller can read without parsing
	// the page, and the seconds are the only thing the locked paragraph has to render.
	it('fails 429 and carries the wait through unchanged when the address is locked', async () => {
		signsIn.mockReturnValue({
			status: 'locked',
			retryAfterSeconds: 40,
		});

		expect(await submit('the-token')).toMatchObject({
			status: 429,
			data: {
				locked: true,
				retryAfterSeconds: 40,
			},
		});
	});

	it('never reaches the counter with a submission carrying no token', async () => {
		expect(await actions.default(submitting(new Map()))).toMatchObject({
			status: 401,
			data: {
				invalid: true,
			},
		});

		expect(signsIn).not.toHaveBeenCalled();
	});
});
