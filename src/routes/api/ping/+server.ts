import { json } from '@sveltejs/kit';
import ping from 'ping';

export async function POST({ request }) {
	const { href } = await request.json();
	const url = new URL(href);

	const { alive } = await ping.promise.probe(url.hostname);

	return json({
		isAlive: alive
	});
}
