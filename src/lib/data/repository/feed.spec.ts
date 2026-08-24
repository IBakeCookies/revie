import { afterEach, describe, expect, it, vi } from 'vitest';
import { $getFeed } from '$lib/data/repository/feed';

const href = 'https://example.local/feed.xml';

const input = {
	href,
	// The read's budget is minted by business and handed down, so these cases only need a
	// signal that exists. Short enough that a leaked real fetch dies.
	signal: AbortSignal.timeout(50),
};

/** An RSS 2.0 document with the noise real feeds carry: CDATA, an entity, an empty entry. */
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
	<channel>
		<title>Example News</title>
		<link>https://example.local</link>
		<item>
			<title>First post</title>
			<link>https://example.local/first</link>
		</item>
		<item>
			<title><![CDATA[Second & Co.]]></title>
			<link>https://example.local/second</link>
		</item>
		<item>
			<title>Tips &amp; tricks</title>
			<link>https://example.local/third</link>
		</item>
		<item>
			<title>No link home</title>
		</item>
		<item>
			<title></title>
			<link>https://example.local/empty-title</link>
		</item>
	</channel>
</rss>`;

/**
 * An Atom document whose entries carry the link as an ATTRIBUTE, one of them listing
 * three — only the alternate goes where the entry does.
 */
const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>Example Updates</title>
	<entry>
		<title>Type-safe SQL at 2026</title>
		<link rel="self" href="https://example.local/self"/>
		<link rel="alternate" href="https://example.local/posts/type-safe-sql"/>
		<link rel="enclosure" href="https://example.local/media.ogg"/>
	</entry>
	<entry>
		<title>Plain link</title>
		<link href="https://example.local/posts/plain"/>
	</entry>
</feed>`;

/** RSS 1.0: items straight under a namespaced root, links as text like RSS 2.0. */
const rdf = `<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
	<item>
		<title>RDF item</title>
		<link>https://example.local/rdf-item</link>
	</item>
</rdf:RDF>`;

function stubFetch(body: string): ReturnType<typeof vi.fn> {
	const fetchMock = vi.fn(
		async () =>
			({
				ok: true,
				text: async () => body,
			}) as Response,
	);

	vi.stubGlobal('fetch', fetchMock);

	return fetchMock;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('$getFeed', () => {
	it('asks for the href VERBATIM, appending no path and rewriting no query', async () => {
		const fetchMock = stubFetch(rss);
		const [err] = await $getFeed(input);

		expect(err).toBeNull();
		expect(fetchMock).toHaveBeenCalledWith(href, expect.anything());
	});

	it('uses the signal it was given rather than minting one', async () => {
		const fetchMock = stubFetch(rss);

		await $getFeed(input);

		expect(fetchMock.mock.calls[0][1].signal).toBe(input.signal);
	});

	it('reads RSS 2.0 items, decoding CDATA and entities, dropping unreadable entries', async () => {
		stubFetch(rss);

		const [err, feed] = await $getFeed(input);

		expect(err).toBeNull();

		// The two entries without a usable half are gone; the rest keep feed order.
		// CDATA arrives literal — the XML spec does not decode entities inside it —
		// while an entity in ordinary text is decoded.
		expect(feed).toEqual([
			{
				title: 'First post',
				link: 'https://example.local/first',
			},
			{
				title: 'Second & Co.',
				link: 'https://example.local/second',
			},
			{
				title: 'Tips & tricks',
				link: 'https://example.local/third',
			},
		]);
	});

	it('takes an Atom link from its href attribute, preferring the alternate', async () => {
		stubFetch(atom);

		const [err, feed] = await $getFeed(input);

		expect(err).toBeNull();

		expect(feed).toEqual([
			{
				title: 'Type-safe SQL at 2026',
				link: 'https://example.local/posts/type-safe-sql',
			},
			{
				title: 'Plain link',
				link: 'https://example.local/posts/plain',
			},
		]);
	});

	// A title that IS a number is still a title: `parseTagValue` is off so the schema
	// never rejects a row for saying "2026".
	it('keeps a numeric-looking title a string', async () => {
		stubFetch(
			`<rss><channel><item><title>2026</title><link>https://example.local/y</link></item></channel></rss>`,
		);

		const [err, feed] = await $getFeed(input);

		expect(err).toBeNull();

		expect(feed).toEqual([
			{
				title: '2026',
				link: 'https://example.local/y',
			},
		]);
	});

	it('reads RDF items from under the namespaced root', async () => {
		stubFetch(rdf);

		const [err, feed] = await $getFeed(input);

		expect(err).toBeNull();

		expect(feed).toEqual([
			{
				title: 'RDF item',
				link: 'https://example.local/rdf-item',
			},
		]);
	});

	it('names the status in the message the log gets', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					({
						ok: false,
						status: 404,
						statusText: 'Not Found',
					}) as Response,
			),
		);

		const [err] = await $getFeed(input);

		expect(err?.message).toContain('The feed responded with 404 Not Found');
	});

	it('reports a body that parses as XML but carries no feed as an error', async () => {
		stubFetch('<html><body>Maintenance</body></html>');

		const [err] = await $getFeed(input);

		expect(err?.message).toContain('without a single readable entry');
	});

	it('reports a body that does not parse as XML at all as an error', async () => {
		// A malformed ATTRIBUTE is what actually stops the parser; it is lenient about
		// truncation, which lands in the no-readable-entries error above instead.
		stubFetch('<rss version="1.0><channel></rss>');

		const [err] = await $getFeed(input);

		expect(err?.message).toContain('did not parse as XML');
	});

	it('reports a network failure as an error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new Error('ECONNREFUSED');
			}),
		);

		const [err] = await $getFeed(input);

		expect((err?.cause as Error).message).toBe('ECONNREFUSED');
	});
});
