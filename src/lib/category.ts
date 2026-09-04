import { FEEDS } from '../config/feeds';

/** Feeds that don't name a category are gathered here. */
export const DEFAULT_CATEGORY = 'Other';

/** Attribute- and URL-safe form of a category label. */
export function categorySlug(label: string): string {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export interface CategoryEntry {
	label: string;
	slug: string;
	feedIds: string[];
}

/**
 * Categories in the order feeds.ts first mentions them, so the tab order is
 * whatever the config author chose rather than something alphabetical.
 */
export function categoryIndex(): CategoryEntry[] {
	const byLabel = new Map<string, CategoryEntry>();

	for (const feed of FEEDS) {
		const label = feed.category || DEFAULT_CATEGORY;
		const entry = byLabel.get(label) ?? { label, slug: categorySlug(label), feedIds: [] };
		entry.feedIds.push(feed.id);
		byLabel.set(label, entry);
	}

	return [...byLabel.values()];
}
