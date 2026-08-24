import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * Proxmox VE's cluster resource list, transcribed from the published API docs
 * (`pve-devel`'s `PVE/API2/Cluster.pm`, `/api2/json/cluster/resources`) and **not
 * exercised against a live instance** — roadmap #33's own instruction, true of every
 * provider under it.
 *
 * The cluster endpoint rather than a per-node one, because a standalone host IS a cluster
 * of one: it needs no node name in the config, so `href` stays the only address the box
 * asks an operator for. Every entry carries dozens of fields; only what the projection
 * reads is declared. `cpu`, `mem` and `maxmem` are optional because entries that are not
 * online nodes omit them (`sdn`, `pool`, a node that is offline), and `template` because
 * a template is a stopped guest on the wire and must not count as one in the box.
 */
const resourcesSchema = v.object({
	data: v.array(
		v.object({
			type: v.string(),
			status: v.string(),
			cpu: v.optional(v.number()),
			mem: v.optional(v.number()),
			maxmem: v.optional(v.number()),
			template: v.optional(v.number()),
		}),
	),
});

export type ProxmoxWire = v.InferOutput<typeof resourcesSchema>;

export type GetProxmoxStatsInput = {
	href: string;
	/**
	 * An API token, `user@realm!tokenid=secret`, as one opaque string — the same
	 * one-string-per-instance rule as AdGuard's `username:password`. A pasted
	 * `PVEAPIToken=` prefix (the form the docs show) is stripped; anything without a
	 * `tokenid=secret` half fails here rather than at Proxmox, because a 401 does not
	 * tell an operator they pasted only the secret.
	 */
	credential?: string;
	/** The whole read's budget, minted by business. */
	signal: AbortSignal;
};

const TOKEN_HEADER_PREFIX = 'PVEAPIToken=';

export function $getProxmoxStats({
	href,
	credential,
	signal,
}: GetProxmoxStatsInput): Promise<Result<ProxmoxWire>> {
	return useAsyncErrorAsValue(async () => {
		if (!credential?.includes('=')) {
			throw new Error('credentials must be the API token, "user@realm!tokenid=secret"');
		}

		const token = credential.startsWith(TOKEN_HEADER_PREFIX)
			? credential.slice(TOKEN_HEADER_PREFIX.length)
			: credential;

		const raw = await fetch(`${href}/api2/json/cluster/resources`, {
			headers: {
				Authorization: `PVEAPIToken=${token}`,
			},
			// No redirect refusal, unlike the Pi-holes: the credential rides in
			// `Authorization`, which fetch deletes when a redirect crosses an origin, so a
			// followed one reaches its target unauthenticated — the measured AdGuard case,
			// with nothing left to leak.
			signal,
		});

		// fetch only rejects on network errors, so an auth failure would otherwise
		// surface as an unrelated JSON parse error.
		if (!raw.ok) {
			throw new Error(`Proxmox responded with ${raw.status} ${raw.statusText}`);
		}

		const parsed = v.safeParse(resourcesSchema, await raw.json());

		if (!parsed.success) {
			throw new Error('answered 200 with a body that is not stats');
		}

		return parsed.output;
	}, `Could not read Proxmox stats from ${href}`);
}
