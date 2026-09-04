/**
 * Your feed list. This is the only file you need to edit to add/remove feeds.
 *
 * - `id`       must be unique and stable (used for filter state)
 * - `title`    is what shows on the source badge
 * - `tags`     are free-form; every distinct tag becomes a filter chip
 * - `category` becomes a tab at the top; it scopes the whole page
 */
export interface FeedSource {
	id: string;
	title: string;
	url: string;
	tags: string[];
	/**
	 * Which top tab this feed lives under. Tabs appear in the order they are first
	 * used below, so reordering feeds reorders the tabs. Feeds that leave it out
	 * are gathered under "Other".
	 */
	category?: string;
	/** Optional: link to the site itself, shown in the sidebar. Defaults to the feed's own link. */
	homepage?: string;
	/**
	 * Optional: accent colour for this feed's dot, card stripe and source name.
	 * Any CSS colour works; omit it and one is derived from `id`. Wrap two in
	 * `light-dark(…, …)` when one shade doesn't read well in both themes:
	 *   color: '#e10600'
	 *   color: 'light-dark(hsl(4 82% 42%), hsl(4 78% 66%))'
	 */
	color?: string;
}

export const FEEDS: FeedSource[] = [
	{
		id: 'tr',
		category: 'Motorsport',
		title: 'The Race',
		url: 'https://www.the-race.com/category/formula-1/rss/',
		tags: ['formula 1', 'f1'],
		homepage: 'https://www.the-race.com',
		color: '#e15a00',

	},
	{
		id: 'retail-wowhead',
		category: 'World of Warcraft',
		title: 'Wowhead Retail',
		url: 'https://www.wowhead.com/news/rss/retail',
		tags: ['wow', 'world of warcraft', 'gaming', 'news', 'blizzard', 'retail', 'wow news'],
		homepage: 'https://www.wowhead.com',
		color: '#e10600',
	},
	{
		id: 'classic-wowhead',
		category: 'World of Warcraft',
		title: 'Wowhead Classic',
		url: 'https://www.wowhead.com/news/rss/classic',
		tags: ['wow', 'world of warcraft', 'gaming', 'news', 'blizzard', 'classic', 'wow news'],
		homepage: 'https://www.wowhead.com',
		color: '#e1070070',
	},
	{
		id: 'f1',
		category: 'Motorsport',
		title: 'Formula 1',
		url: 'https://www.formula1.com/en/latest/all.xml',
		tags: ['formula 1', 'f1'],
		homepage: 'https://www.formula1.com',
		color: '#f12f28',
	},
	{
		id: 'f2',
		category: 'Motorsport',
		title: 'Formula 2',
		url: 'https://www.fiaformula2.com/en/latest/all.xml',
		tags: ['formula 2', 'f2'],
		homepage: 'https://www.fiaformula2.com',
		color: '#0058db',
	},
	{
		id: 'motorsportf1',
		category: 'Motorsport',
		title: 'Motorsport.com F1',
		url: 'https://www.motorsport.com/rss/f1/news/',
		tags: ['formula 1', 'f1'],
		homepage: 'https://www.motorsport.com',
		color: '#e1d200',
	},
	{
		id: 'autosportf1',
		category: 'Motorsport',
		title: 'Autosport.com F1',
		url: 'https://www.autosport.com/rss/f1/news/',
		tags: ['formula 1', 'f1'],
		homepage: 'https://www.autosport.com',
		color: '#e10600',
	},
	{
		id: 'bbci-f1',
		category: 'Motorsport',
		title: 'BBC Sport F1',
		url: 'https://feeds.bbci.co.uk/sport/formula1/rss.xml',
		tags: ['formula 1', 'f1'],
		homepage: 'https://www.bbc.com/sport/formula1',
		color: '#a18900',
	},
	{
		id: 'guardian-f1',
		category: 'Motorsport',
		title: 'The Guardian F1',
		url: 'https://www.theguardian.com/sport/formulaone/rss',
		tags: ['formula 1', 'f1'],
		homepage: 'https://www.theguardian.com/sport/formulaone',
		color: '#00028d',
	},
	{
		id: 'icyveins-wow',
		category: 'World of Warcraft',
		title: 'Icy Veins',
		url: 'https://wp-prod.icy-veins.com/custom-rss/?category=wow',
		tags: ['wow', 'world of warcraft', 'gaming', 'news', 'blizzard', 'wow news'],
		homepage: 'https://www.icy-veins.com',
		color: '#00d9ff',
	},

];

/** How long fetched feeds are reused before hitting the network again. */
export const CACHE_TTL_MS = 15 * 60 * 1000;

/** Give up on a single feed after this long so one slow host can't stall the page. */
export const FETCH_TIMEOUT_MS = 8000;

/** Cap on articles kept per feed, newest first. */
export const MAX_ITEMS_PER_FEED = 40;
