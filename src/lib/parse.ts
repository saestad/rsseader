import { XMLParser } from 'fast-xml-parser';
import type { FeedSource } from '../config/feeds';

export interface Article {
	/** Stable per-article key: feed id + guid/link. */
	id: string;
	title: string;
	link: string;
	/** Plain-text excerpt, HTML already stripped. */
	summary: string;
	/** Epoch ms, or null when the feed gave us nothing parseable. */
	publishedAt: number | null;
	/**
	 * What the timeline sorts on. Equals `publishedAt` whenever the feed dated the
	 * item; otherwise it is derived from the feed's own order. Never displayed.
	 */
	sortKey: number;
	author: string | null;
	image: string | null;
	sourceId: string;
	sourceTitle: string;
	tags: string[];
}

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	trimValues: true,
	processEntities: true,
	htmlEntities: true,
	// Feeds are wildly inconsistent about whether a node is text-only or has
	// attributes, so never collapse a tag we care about into a bare string.
	isArray: (name) => ['item', 'entry', 'link', 'category', 'enclosure'].includes(name),
});

function toArray<T>(value: T | T[] | undefined | null): T[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

/** fast-xml-parser hands back a string, a number, or `{ '#text': ... }` depending on attributes. */
function text(node: unknown): string {
	if (node === undefined || node === null) return '';
	if (typeof node === 'string') return node;
	if (typeof node === 'number' || typeof node === 'boolean') return String(node);
	if (Array.isArray(node)) return text(node[0]);
	if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
		return text((node as Record<string, unknown>)['#text']);
	}
	return '';
}

function attr(node: unknown, name: string): string {
	if (node && typeof node === 'object' && !Array.isArray(node)) {
		const value = (node as Record<string, unknown>)[`@_${name}`];
		if (value !== undefined && value !== null) return String(value);
	}
	return '';
}

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	hellip: '…',
	mdash: '—',
	ndash: '–',
	rsquo: '’',
	lsquo: '‘',
	ldquo: '“',
	rdquo: '”',
};

function decodeEntities(input: string): string {
	return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
		if (code[0] === '#') {
			const value =
				code[1] === 'x' || code[1] === 'X'
					? Number.parseInt(code.slice(2), 16)
					: Number.parseInt(code.slice(1), 10);
			return Number.isFinite(value) ? String.fromCodePoint(value) : match;
		}
		return ENTITIES[code.toLowerCase()] ?? match;
	});
}

/** Feed descriptions are usually HTML. We only ever render the plain text. */
function stripHtml(input: string, maxLength = 320): string {
	const plain = decodeEntities(
		input
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
	)
		.replace(/\s+/g, ' ')
		.trim();

	if (plain.length <= maxLength) return plain;
	const cut = plain.slice(0, maxLength);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function parseDate(...candidates: unknown[]): number | null {
	for (const candidate of candidates) {
		const raw = text(candidate);
		if (!raw) continue;
		const parsed = Date.parse(raw);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function findImage(item: Record<string, unknown>, html: string): string | null {
	for (const enclosure of toArray(item.enclosure)) {
		const type = attr(enclosure, 'type');
		const url = attr(enclosure, 'url');
		if (url && (!type || type.startsWith('image/'))) return url;
	}

	for (const key of ['media:thumbnail', 'media:content', 'itunes:image']) {
		for (const node of toArray(item[key])) {
			const url = attr(node, 'url') || attr(node, 'href');
			if (url) return url;
		}
	}

	const inline = html.match(/<img[^>]+src=["']([^"']+)["']/i);
	return inline ? decodeEntities(inline[1]!) : null;
}

/** Atom entries carry several <link>s; we want the readable one. */
function atomLink(entry: Record<string, unknown>): string {
	const links = toArray(entry.link);
	const alternate = links.find((l) => {
		const rel = attr(l, 'rel');
		return (rel === '' || rel === 'alternate') && attr(l, 'href');
	});
	if (alternate) return attr(alternate, 'href');
	for (const link of links) {
		const href = attr(link, 'href');
		if (href) return href;
	}
	return text(entry.link);
}

function categories(item: Record<string, unknown>): string[] {
	return toArray(item.category)
		.map((c) => (attr(c, 'term') || text(c)).trim())
		.filter(Boolean);
}

function buildArticle(
	source: FeedSource,
	raw: {
		title: string;
		link: string;
		body: string;
		publishedAt: number | null;
		author: string;
		guid: string;
		item: Record<string, unknown>;
	}
): Article | null {
	const title = decodeEntities(stripHtml(raw.title, 240));
	const link = raw.link.trim();
	if (!title && !link) return null;

	return {
		id: `${source.id}:${raw.guid || link || title}`,
		title: title || '(untitled)',
		link,
		summary: stripHtml(raw.body),
		publishedAt: raw.publishedAt,
		// Placeholder for undated items; applyFallbackOrder fills those in once the
		// whole feed is parsed and we can see each item's neighbours.
		sortKey: raw.publishedAt ?? 0,
		author: decodeEntities(raw.author).trim() || null,
		image: findImage(raw.item, raw.body),
		sourceId: source.id,
		sourceTitle: source.title,
		// Feed-level tags first (those drive the filters), then per-item categories
		// so search can match them too.
		tags: [...new Set([...source.tags, ...categories(raw.item).map((c) => c.toLowerCase())])],
	};
}

/** How far apart undated items are spaced when nothing bounds them from below. */
const UNDATED_STEP_MS = 60 * 60 * 1000;

/**
 * Some feeds date nothing at all (formula1.com and fiaformula2.com's all.xml,
 * for two) but still list newest first, so we lean on that order: every undated
 * run is spread between the dated items above and below it, and a feed that
 * dates nothing hangs off the moment we fetched it. This only ever touches
 * `sortKey` — `publishedAt` stays null so the card still says "undated" rather
 * than showing a timestamp we made up.
 *
 * The bias is deliberate but worth knowing: an all-undated feed's newest item
 * always sorts near the top, because "newest in the feed" is the only signal it
 * gave us. Resolving real dates from the article pages is the fix for that.
 */
function applyFallbackOrder(articles: Article[], fetchedAt: number): void {
	for (let i = 0; i < articles.length; i++) {
		if (articles[i]!.publishedAt !== null) continue;

		// Take the whole undated run at once so it can be fitted between neighbours.
		let end = i;
		while (end < articles.length && articles[end]!.publishedAt === null) end++;

		const run = end - i;
		const above = i > 0 ? articles[i - 1]!.sortKey : fetchedAt;
		const below = end < articles.length ? articles[end]!.publishedAt : null;
		// max(0) guards feeds that aren't actually in date order: the run collapses
		// onto its anchor and the stable sort keeps the feed's own sequence.
		const gap = below === null ? UNDATED_STEP_MS * (run + 1) : Math.max(0, above - below);
		const step = Math.min(UNDATED_STEP_MS, gap / (run + 1));

		for (let j = 0; j < run; j++) {
			articles[i + j]!.sortKey = above - step * (j + 1);
		}

		i = end - 1;
	}
}

/**
 * Parse RSS 2.0, RSS 1.0 (RDF), or Atom into a common Article shape.
 * Items come back in feed order; `fetchedAt` anchors undated ones.
 * Throws on XML that isn't recognisably a feed.
 */
export function parseFeed(xml: string, source: FeedSource, fetchedAt = Date.now()): Article[] {
	const doc = parser.parse(xml) as Record<string, any>;

	const ordered = (items: Article[]): Article[] => {
		applyFallbackOrder(items, fetchedAt);
		return items;
	};

	const channel = doc?.rss?.channel ?? doc?.channel;
	const rdf = doc?.['rdf:RDF'] ?? doc?.RDF;
	const atom = doc?.feed;

	if (channel) {
		return ordered(
			toArray<Record<string, unknown>>(Array.isArray(channel) ? channel[0]?.item : channel.item)
				.map((item) => {
					const body = text(item['content:encoded']) || text(item.description);
					return buildArticle(source, {
						title: text(item.title),
						link: text(item.link) || attr(toArray(item.link)[0], 'href'),
						body,
						publishedAt: parseDate(item.pubDate, item['dc:date'], item.published, item.updated),
						author: text(item['dc:creator']) || text(item.author),
						guid: text(item.guid),
						item,
					});
				})
				.filter((a): a is Article => a !== null)
		);
	}

	if (rdf) {
		return ordered(
			toArray<Record<string, unknown>>(rdf.item)
				.map((item) =>
					buildArticle(source, {
						title: text(item.title),
						link: text(item.link) || attr(item, 'rdf:about'),
						body: text(item['content:encoded']) || text(item.description),
						publishedAt: parseDate(item['dc:date'], item.date),
						author: text(item['dc:creator']),
						guid: attr(item, 'rdf:about'),
						item,
					})
				)
				.filter((a): a is Article => a !== null)
		);
	}

	if (atom) {
		return ordered(
			toArray<Record<string, unknown>>(atom.entry)
				.map((entry) =>
					buildArticle(source, {
						title: text(entry.title),
						link: atomLink(entry),
						body: text(entry.content) || text(entry.summary),
						publishedAt: parseDate(entry.published, entry.updated),
						author: text((entry.author as Record<string, unknown>)?.name) || text(entry.author),
						guid: text(entry.id),
						item: entry,
					})
				)
				.filter((a): a is Article => a !== null)
		);
	}

	throw new Error('Not a recognisable RSS, RDF or Atom document');
}
