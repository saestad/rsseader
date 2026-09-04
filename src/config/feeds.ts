/**
 * Your feed list. This is the only file you need to edit to add/remove feeds.
 *
 * - `id`    must be unique and stable (used for filter state)
 * - `title` is what shows on the source badge
 * - `tags`  are free-form; every distinct tag becomes a filter chip
 */
export interface FeedSource {
	id: string;
	title: string;
	url: string;
	tags: string[];
	/** Optional: link to the site itself, shown in the sidebar. Defaults to the feed's own link. */
	homepage?: string;
}

export const FEEDS: FeedSource[] = [
	{
		id: 'tr',
		title: 'The Race',
		url: 'https://www.the-race.com/category/formula-1/rss/',
		tags: ['formula 1', 'f1', 'the-race'],
		homepage: 'https://www.the-race.com',
	},
	{
		id: 'retail-wowhead',
		title: 'Wowhead Retail',
		url: 'https://www.wowhead.com/news/rss/retail',
		tags: ['wow', 'world of warcraft', 'gaming', 'news', 'blizzard', 'retail', 'wowhead', 'wow news'],
		homepage: 'https://www.wowhead.com',
	},
	{
		id: 'f1',
		title: 'Formula 1',
		url: 'https://www.formula1.com/en/latest/all.xml',
		tags: ['formula 1', 'f1'],
		homepage: 'https://www.formula1.com',
	},
	{
		id: 'f2',
		title: 'Formula 2',
		url: 'https://www.fiaformula2.com/en/latest/all.xml',
		tags: ['formula 2', 'f2'],
		homepage: 'https://www.fiaformula2.com',
	},
	{
		id: 'motorsportf1',
		title: 'Motorsport.com F1',
		url: 'https://www.motorsport.com/rss/f1/news/',
		tags: ['formula 1', 'f1', 'motorsport.com'],
		homepage: 'https://www.motorsport.com',
	},
	{
		id: 'motorsportf2',
		title: 'Motorsport.com F2',
		url: 'https://www.motorsport.com/rss/f2/news/',
		tags: ['formula 2', 'f2', 'motorsport.com'],
		homepage: 'https://www.motorsport.com',
	},
];

/** How long fetched feeds are reused before hitting the network again. */
export const CACHE_TTL_MS = 15 * 60 * 1000;

/** Give up on a single feed after this long so one slow host can't stall the page. */
export const FETCH_TIMEOUT_MS = 8000;

/** Cap on articles kept per feed, newest first. */
export const MAX_ITEMS_PER_FEED = 40;
