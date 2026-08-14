import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { signInAdmin } from '$lib/business/model/admin-auth';

export const actions: Actions = {
	default: async ({ cookies, request }) => {
		const token = (await request.formData()).get('token');

		// A flag, never the submitted value: the words are presentation's to pick,
		// and echoing the token back would put it in the HTML and in the history.
		if (typeof token !== 'string' || !signInAdmin(cookies, token)) {
			return fail(401, {
				invalid: true,
			});
		}

		redirect(303, '/admin');
	},
};
