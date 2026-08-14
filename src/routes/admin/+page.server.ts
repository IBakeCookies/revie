import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { readConfig } from '$lib/business/model/config-source';
import { signOutAdmin } from '$lib/business/model/admin-auth';

// No auth check here: `handleAdmin` in hooks.server.ts has already answered for
// every /admin path, so a second one would be a second place to get it wrong.
export const load: PageServerLoad = async () => {
	const { config } = await readConfig();

	return {
		config,
	};
};

export const actions: Actions = {
	logout: ({ cookies }) => {
		signOutAdmin(cookies);

		redirect(303, '/admin/login');
	},
};
