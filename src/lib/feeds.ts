import {
	CACHE_TTL_MS,
	FEEDS,
	FETCH_TIMEOUT_MS,
	MAX_ITEMS_PER_FEED,
	type FeedSource,
} from '../config/feeds';
import { parseFeed, type Article } from './parse';

export type { Article };

export interface FeedError {
	sourceId: string;
	sourceTitle: string;
	message: string;
}

export interface FeedBundle {
	articles: Article[];
	errors: FeedError[];
	/** When this data was fetched, so the page can show "updated N min ago". */
	fetchedAt: number;
}

interface CacheEntry {
	expiresAt: number;
	bundle: FeedBundle;
}

/**
 * Module scope survives between requests within a Worker isolate, so this
 * absorbs most repeat loads. It is best-effort: a cold isolate just refetches.
 */
let cache: CacheEntry | null = null;
let inFlight: Promise<FeedBundle> | null = null;

async function fetchOne(source: FeedSource): Promise<Article[]> {
	const response = await fetch(source.url, {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: {
			// Some hosts serve HTML or 403 to clients without these.
			accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
			'user-agent': 'RSSeader/1.0 (+personal feed reader)',
		},
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
	}

	const articles = parseFeed(await response.text(), source);

	return articles
		.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
		.slice(0, MAX_ITEMS_PER_FEED);
}

async function fetchAll(): Promise<FeedBundle> {
	const results = await Promise.allSettled(FEEDS.map(fetchOne));

	const articles: Article[] = [];
	const errors: FeedError[] = [];

	results.forEach((result, index) => {
		const source = FEEDS[index]!;
		if (result.status === 'fulfilled') {
			articles.push(...result.value);
		} else {
			const reason = result.reason;
			errors.push({
				sourceId: source.id,
				sourceTitle: source.title,
				message: reason instanceof Error ? reason.message : String(reason),
			});
		}
	});

	// Undated items sink to the bottom rather than jumping to 1970.
	articles.sort((a, b) => (b.publishedAt ?? -Infinity) - (a.publishedAt ?? -Infinity));

	// Cross-posted stories (same URL in two feeds) would otherwise appear twice.
	const seen = new Set<string>();
	const deduped = articles.filter((article) => {
		const key = article.link || article.id;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});

	return { articles: deduped, errors, fetchedAt: Date.now() };
}

/**
 * All feeds, merged and sorted newest-first. Cached for CACHE_TTL_MS.
 * Concurrent callers share one in-flight fetch.
 */
export function getFeedBundle(force = false): Promise<FeedBundle> {
	if (!force && cache && cache.expiresAt > Date.now()) {
		return Promise.resolve(cache.bundle);
	}
	if (inFlight) return inFlight;

	inFlight = fetchAll()
		.then((bundle) => {
			cache = { expiresAt: Date.now() + CACHE_TTL_MS, bundle };
			return bundle;
		})
		.catch((error) => {
			// Serving stale beats serving nothing when the network misbehaves.
			if (cache) return cache.bundle;
			throw error;
		})
		.finally(() => {
			inFlight = null;
		});

	return inFlight;
}

/** Every distinct feed-level tag, with how many feeds carry it. */
export function tagIndex(): { tag: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const feed of FEEDS) {
		for (const tag of feed.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => a.tag.localeCompare(b.tag));
}
