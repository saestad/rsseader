import { FEEDS } from '../config/feeds';

/** Feeds that named their own colour opt out of the hash below. */
const OVERRIDES = new Map(
	FEEDS.filter((feed) => feed.color).map((feed) => [feed.id, feed.color!] as const)
);

/**
 * Accent colour per feed: whatever the config asked for, otherwise derived from
 * the id so a source keeps the same dot/stripe across reloads without anyone
 * having to pick hex codes.
 */
export function feedColor(id: string): string {
	const chosen = OVERRIDES.get(id);
	if (chosen) return chosen;

	let hash = 0;
	for (let i = 0; i < id.length; i++) {
		hash = (hash * 31 + id.charCodeAt(i)) | 0;
	}
	const hue = Math.abs(hash) % 360;
	// Fixed S/L keeps every feed at comparable weight; light-dark() adapts it.
	return `light-dark(hsl(${hue} 62% 40%), hsl(${hue} 58% 66%))`;
}
