import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { readConfigText, writeConfig } from '$lib/business/model/config-source';
import { signOutAdmin } from '$lib/business/model/admin-auth';

// No auth check here: `handleAdmin` in hooks.server.ts has already answered for
// every /admin path, so a second one would be a second place to get it wrong.
export const load: PageServerLoad = async () => {
	// The file's text, not the normalized config: an operator opening the editor must
	// find their own file, `defaults` and all.
	const [error, text] = await readConfigText();

	// A flag, not the message: an empty editor over an UNREADABLE file looks exactly
	// like an empty file, above a button that would overwrite the real one. The words
	// are presentation's, and `error.message` has no sink here.
	return {
		text: text ?? '',
		readFailed: error !== null,
	};
};

export const actions: Actions = {
	save: async ({ request }) => {
		const field = (await request.formData()).get('config');
		const submitted = typeof field === 'string' ? field : '';
		const { rejection, warnings } = await writeConfig(submitted);

		// The rejected text goes back with the failure so the operator keeps their edit;
		// `load` re-runs on every action and would otherwise hand back the unchanged file.
		if (rejection) {
			return fail(422, {
				rejection,
				warnings,
				text: submitted,
			});
		}

		return {
			saved: true,
		};
	},

	logout: ({ cookies }) => {
		signOutAdmin(cookies);

		redirect(303, '/admin/login');
	},
};
