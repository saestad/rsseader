import {
	CACHE_TTL_MS,
	FEEDS,
	FETCH_TIMEOUT_MS,
	MAX_ITEMS_PER_FEED,
	type FeedSource,
} from '../config/feeds';
import { parseFeed, type Article } from './parse';
import { categorySlug, DEFAULT_CATEGORY } from './category';

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

	// parseFeed derives sort keys for undated items from feed order, so it needs
	// the articles in the order the feed listed them — sort only afterwards.
	const articles = parseFeed(await response.text(), source, Date.now());

	return articles.sort((a, b) => b.sortKey - a.sortKey).slice(0, MAX_ITEMS_PER_FEED);
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

	// sortKey is publishedAt where the feed gave us one, and a position-derived
	// stand-in where it didn't, so undated feeds interleave instead of sinking.
	articles.sort((a, b) => b.sortKey - a.sortKey);

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

/**
 * Every distinct feed-level tag, with how many feeds carry it and which
 * categories it appears under — the top tabs hide chips that can't match.
 */
export function tagIndex(): { tag: string; count: number; categories: string[] }[] {
	const counts = new Map<string, number>();
	const categories = new Map<string, Set<string>>();

	for (const feed of FEEDS) {
		const slug = categorySlug(feed.category || DEFAULT_CATEGORY);
		for (const tag of feed.tags) {
			counts.set(tag, (counts.get(tag) ?? 0) + 1);
			if (!categories.has(tag)) categories.set(tag, new Set());
			categories.get(tag)!.add(slug);
		}
	}

	return [...counts.entries()]
		.map(([tag, count]) => ({ tag, count, categories: [...categories.get(tag)!] }))
		.sort((a, b) => a.tag.localeCompare(b.tag));
}
