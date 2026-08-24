/**
 * One row of a feed box. Presentation-facing vocabulary, like `Stat` — which is
 * why it lives here and not in `data/`: the layer rule lets `data` import leaf
 * modules only, so the wire shape it validates is its own, projected onto this.
 */
export type FeedItem = {
	/** The entry's title, as the feed wrote it — entities decoded, trimmed. */
	title: string;
	/** Where the row links out to, verbatim from the feed. */
	link: string;
};
