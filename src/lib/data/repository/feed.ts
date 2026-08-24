import { XMLParser } from 'fast-xml-parser';
import * as v from 'valibot';
import { type Result, useAsyncErrorAsValue } from '$lib/utils/useAsyncErrorAsValue';

/**
 * An RSS 2.0 / Atom / RDF feed, read the one way this app reads anything: fetched
 * server-side (CORS kills a client-side fetch of most feeds), parsed with a real XML
 * parser — regex-extracting Atom is exactly the cleverness roadmap #48 refuses — and
 * validated with valibot AFTER parsing, never instead of it.
 *
 * The three formats share no container element: RSS nests `item` under `channel`,
 * Atom uses `entry`, and RDF/RSS 1.0 puts `item` straight under its root. All of them
 * are extracted below and validated entry by entry.
 */

/**
 * One readable row. Both fields have to survive as non-empty strings — an entry with a
 * title but no link has nothing to open, and an entry with neither has nothing to show.
 * Validated per entry rather than over the whole array, so one malformed entry costs
 * itself and not the box: real feeds carry the occasional ad or empty stub.
 */
const feedEntrySchema = v.object({
	title: v.pipe(v.string(), v.nonEmpty()),
	link: v.pipe(v.string(), v.nonEmpty()),
});

export type FeedEntryWire = v.InferOutput<typeof feedEntrySchema>;

/** The whole wire: every entry that survived validation, in feed order. */
export type FeedWire = FeedEntryWire[];

/**
 * Configured once at module scope; stateless after construction. `removeNSPrefix`
 * folds `rdf:item` / `atom:entry` onto the plain names below. `parseTagValue` off,
 * because otherwise a title that IS a number (`<title>2026</title>`) arrives as a
 * number and fails the schema for being what it honestly said.
 */
const parser = new XMLParser({
	ignoreAttributes: false,
	removeNSPrefix: true,
	processEntities: true,
	trimValues: true,
	parseTagValue: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray<T>(value: T | T[] | undefined): T[] {
	return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/**
 * The text content of a title-like element. A string is the normal case; CDATA arrives
 * as one too. An object means the element carried attributes or inline tags alongside
 * its text, in which case fast-xml-parser keeps the text under `#text`.
 */
function textOf(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number') {
		return String(value);
	}

	if (isRecord(value) && typeof value['#text'] === 'string') {
		return value['#text'];
	}

	return undefined;
}

/**
 * Where an entry goes. RSS puts it in the element's TEXT; Atom makes it an attribute of
 * possibly several `<link>` elements, and they do NOT all go where the entry does
 * (`self`, `enclosure`, `replies`) — so the alternate wins when one is named, and the
 * first link answers when none is.
 */
function linkOf(value: unknown): string | undefined {
	if (typeof value === 'string') {
		return value;
	}

	const links = asArray(value).filter(isRecord);

	const preferred = links.find(
		(link) => link['@_rel'] === undefined || link['@_rel'] === 'alternate',
	);

	const href = (preferred ?? links[0])?.['@_href'];

	return typeof href === 'string' ? href : undefined;
}

/** Extracts then validates one entry, handing back nothing when either half fails. */
function toWire(candidate: unknown): FeedEntryWire | undefined {
	if (!isRecord(candidate)) {
		return undefined;
	}

	const title = textOf(candidate.title);
	const link = linkOf(candidate.link);

	if (title === undefined || link === undefined) {
		return undefined;
	}

	// Never `parse`: one unreadable entry is dropped by the caller, not thrown over.
	const parsed = v.safeParse(feedEntrySchema, {
		title,
		link,
	});

	return parsed.success ? parsed.output : undefined;
}

/**
 * Every entry the three formats name, off whichever containers this document carries.
 * An HTML page served with a 200 parses as XML and yields none of them.
 */
function candidates(document: unknown): unknown[] {
	if (!isRecord(document)) {
		return [];
	}

	return [
		...asArray(
			isRecord(document.rss) && isRecord(document.rss.channel)
				? document.rss.channel.item
				: undefined,
		),
		// `removeNSPrefix` folds `rdf:RDF` onto this plain local name.
		...asArray(isRecord(document.RDF) ? document.RDF.item : undefined),
		...asArray(isRecord(document.feed) ? document.feed.entry : undefined),
	];
}

export type GetFeedInput = {
	/** The feed URL, whole — fetched VERBATIM, no path appended, no query rewritten. */
	href: string;
	/** The whole read's budget, minted by business. */
	signal: AbortSignal;
};

/**
 * No credential, by design rather than by omission: feeds are public documents, so
 * there is nothing here for a redirect to leak — which is why redirects FOLLOW, unlike
 * both Pi-hole providers. An `http:` → `https:` hop is ordinary for a feed and works.
 */
export function $getFeed({ href, signal }: GetFeedInput): Promise<Result<FeedWire>> {
	return useAsyncErrorAsValue(async () => {
		const raw = await fetch(href, {
			signal,
		});

		// fetch only rejects on network errors, so an error page would otherwise surface
		// as an unrelated "no readable entries" instead of the status that caused it.
		if (!raw.ok) {
			throw new Error(`The feed responded with ${raw.status} ${raw.statusText}`);
		}

		let document: unknown;

		try {
			document = parser.parse(await raw.text());
		} catch {
			throw new Error('answered 200 with a body that did not parse as XML');
		}

		// One unreadable entry costs itself, not the box: validated per entry above and
		// dropped here, because real feeds carry the occasional ad or empty stub.
		const readable = candidates(document)
			.map(toWire)
			.filter((entry): entry is FeedEntryWire => entry !== undefined);

		if (readable.length === 0) {
			throw new Error('answered 200 without a single readable entry');
		}

		return readable satisfies FeedWire;
	}, `Could not read the feed from ${href}`);
}
