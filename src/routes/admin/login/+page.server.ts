import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { signInAdmin } from '$lib/business/model/admin-auth';

export const actions: Actions = {
	default: async ({ cookies, getClientAddress, request }) => {
		const token = (await request.formData()).get('token');

		// A flag, never the submitted value: the words are presentation's to pick,
		// and echoing the token back would put it in the HTML and in the history.
		if (typeof token !== 'string') {
			return fail(401, {
				invalid: true,
			});
		}

		const signIn = signInAdmin(cookies, token, getClientAddress());

		// The seconds are data, not copy — the page picks the sentence.
		if (signIn.status === 'locked') {
			return fail(429, {
				locked: true,
				retryAfterSeconds: signIn.retryAfterSeconds,
			});
		}

		if (signIn.status === 'rejected') {
			return fail(401, {
				invalid: true,
			});
		}

		redirect(303, '/admin');
	},
};
