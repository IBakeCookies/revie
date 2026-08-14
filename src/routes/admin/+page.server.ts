import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { needsRawEditor, readConfigText, writeConfig } from '$lib/business/model/config-source';
import { containerFields } from '$lib/business/model/config';
import { signOutAdmin } from '$lib/business/model/admin-auth';

// No auth check here: `handleAdmin` in hooks.server.ts has already answered for
// every /admin path, so a second one would be a second place to get it wrong.
export const load: PageServerLoad = async () => {
	// The file's text, not the normalized config: an operator opening the editor must
	// find their own file, `defaults` and all.
	const [error, text] = await readConfigText();
	const raw = text ?? '';

	return {
		text: raw,
		// A flag, not the message: an empty editor over an UNREADABLE file looks exactly
		// like an empty file, above a button that would overwrite the real one. The words
		// are presentation's, and `error.message` has no sink here.
		readFailed: error !== null,
		// Whether the generated form can represent this file at all. Business answers it,
		// because it is the same question the write asks — and an unreadable file is raw
		// too: `''` does not parse, so the editor offers text rather than an empty form.
		needsRawEditor: needsRawEditor(raw),
		// The schema's own description of every container, walked in business and handed
		// over as data: the editor's fields are generated from this, so a container added
		// to `containerSchemas` appears in the form with nothing here to change. The load
		// is the composition root, which is why this crossing is a route server file's.
		containerFields,
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
