/**
 * All filtering happens in the browser against the server-rendered list, so
 * every keystroke and chip toggle is instant and needs no round trip.
 */

interface Row {
	el: HTMLElement;
	ts: number;
	source: string;
	category: string;
	tags: Set<string>;
	search: string;
}

const DAY_MS = 86_400_000;

const sidebar = document.getElementById('filters');
const searchWrap = document.querySelector<HTMLElement>('.search');
const searchInput = document.getElementById('q') as HTMLInputElement | null;
const list = document.getElementById('feed');
const empty = document.getElementById('empty');
const shown = document.getElementById('shown-count');
const total = document.getElementById('total-count');

if (sidebar && searchInput && list) {
	const rows: Row[] = [...list.querySelectorAll<HTMLElement>('.card')].map((el) => ({
		el,
		ts: Number(el.dataset.ts ?? 0),
		source: el.dataset.source ?? '',
		category: el.dataset.category ?? '',
		tags: new Set((el.dataset.tags ?? '').split('|').filter(Boolean)),
		search: el.dataset.search ?? '',
	}));

	const rangeChips = [...sidebar.querySelectorAll<HTMLElement>('[data-range]')];
	const tagChips = [...sidebar.querySelectorAll<HTMLElement>('[data-tag]')];
	const sourceButtons = [...sidebar.querySelectorAll<HTMLElement>('[data-source-id]')];
	// The tabs live up in the header, not in the sidebar.
	const catTabs = [...document.querySelectorAll<HTMLElement>('.categories [data-category]')];

	const state = {
		q: '',
		range: 'all',
		category: 'all',
		tags: new Set<string>(),
		sources: new Set<string>(),
	};

	/**
	 * Each dimension is independent; a card must clear all of them to show.
	 * Category is the outermost of them: it scopes the sidebar too, so the other
	 * filters only ever offer choices that exist inside the current tab.
	 */
	const matchCategory = (row: Row) => state.category === 'all' || row.category === state.category;
	const matchQuery = (row: Row) => state.q === '' || row.search.includes(state.q);
	const matchRange = (row: Row) => {
		if (state.range === 'all') return true;
		if (!row.ts) return false;
		return row.ts >= Date.now() - Number(state.range) * DAY_MS;
	};
	const matchTags = (row: Row) => {
		if (state.tags.size === 0) return true;
		for (const tag of state.tags) if (row.tags.has(tag)) return true;
		return false;
	};
	const matchSources = (row: Row) => state.sources.size === 0 || state.sources.has(row.source);

	function apply() {
		// Runs first: it can drop selections that the current tab hides.
		syncCategoryScope();

		let visible = 0;
		let inCategory = 0;

		for (const row of rows) {
			if (matchCategory(row)) inCategory++;
			const ok =
				matchCategory(row) &&
				matchQuery(row) &&
				matchRange(row) &&
				matchTags(row) &&
				matchSources(row);
			row.el.hidden = !ok;
			if (ok) visible++;
		}

		if (shown) shown.textContent = String(visible);
		if (total) total.textContent = String(inCategory);
		if (empty) empty.hidden = visible !== 0;

		updateFacets();
		syncGroupState();
		syncUrl();
	}

	/**
	 * Facet counts ignore their own dimension, so a source still shows how many
	 * articles it would contribute if you selected it.
	 */
	function updateFacets() {
		const sourceCounts = new Map<string, number>();
		const tagHits = new Set<string>();

		for (const row of rows) {
			if (!matchCategory(row)) continue;
			if (matchQuery(row) && matchRange(row) && matchTags(row)) {
				sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);
			}
			if (matchQuery(row) && matchRange(row) && matchSources(row)) {
				for (const tag of row.tags) tagHits.add(tag);
			}
		}

		for (const button of sourceButtons) {
			const id = button.dataset.sourceId!;
			const count = sourceCounts.get(id) ?? 0;
			const countEl = button.querySelector('.count');
			if (countEl) countEl.textContent = String(count);
			button.dataset.muted = String(count === 0 && !state.sources.has(id));
		}

		for (const chip of tagChips) {
			const tag = chip.dataset.tag!;
			chip.dataset.muted = String(!tagHits.has(tag) && !state.tags.has(tag));
		}
	}

	const inScope = (el: HTMLElement) => {
		if (state.category === 'all') return true;
		// Source buttons carry one category; tag chips can span several.
		const list = el.dataset.categories ?? el.dataset.category ?? '';
		return list.split('|').includes(state.category);
	};

	/**
	 * Switching tabs hides the sidebar entries that belong to other categories,
	 * and lets go of any selection that just went out of view — otherwise an
	 * invisible chip would keep filtering the list with no way to unset it.
	 */
	function syncCategoryScope() {
		for (const button of sourceButtons) {
			const ok = inScope(button);
			button.hidden = !ok;
			if (!ok && state.sources.delete(button.dataset.sourceId!)) {
				button.setAttribute('aria-pressed', 'false');
			}
		}

		for (const chip of tagChips) {
			const ok = inScope(chip);
			chip.hidden = !ok;
			if (!ok && state.tags.delete(chip.dataset.tag!)) {
				chip.setAttribute('aria-pressed', 'false');
			}
		}

		for (const tab of catTabs) {
			tab.setAttribute('aria-pressed', String(tab.dataset.category === state.category));
		}
	}

	function syncGroupState() {
		sidebar!.querySelector('#group-range')?.setAttribute('data-active', String(state.range !== 'all'));
		sidebar!.querySelector('#group-tags')?.setAttribute('data-active', String(state.tags.size > 0));
		sidebar!
			.querySelector('#group-sources')
			?.setAttribute('data-active', String(state.sources.size > 0));
		searchWrap?.setAttribute('data-filled', String(state.q !== ''));
	}

	/** Keep filters in the URL so a reload or a bookmark restores the same view. */
	function syncUrl() {
		const params = new URLSearchParams();
		if (state.category !== 'all') params.set('cat', state.category);
		if (state.q) params.set('q', state.q);
		if (state.range !== 'all') params.set('range', state.range);
		if (state.tags.size) params.set('tags', [...state.tags].join(','));
		if (state.sources.size) params.set('sources', [...state.sources].join(','));
		const query = params.toString();
		history.replaceState(null, '', query ? `?${query}` : location.pathname);
	}

	function restoreFromUrl() {
		const params = new URLSearchParams(location.search);

		const category = params.get('cat');
		if (category && catTabs.some((tab) => tab.dataset.category === category)) {
			state.category = category;
		}

		const q = params.get('q');
		if (q) {
			state.q = q.toLowerCase();
			searchInput!.value = q;
		}

		const range = params.get('range');
		if (range && rangeChips.some((c) => c.dataset.range === range)) {
			state.range = range;
		}
		for (const chip of rangeChips) {
			chip.setAttribute('aria-pressed', String(chip.dataset.range === state.range));
		}

		for (const tag of params.get('tags')?.split(',').filter(Boolean) ?? []) {
			state.tags.add(tag);
		}
		for (const chip of tagChips) {
			chip.setAttribute('aria-pressed', String(state.tags.has(chip.dataset.tag!)));
		}

		for (const source of params.get('sources')?.split(',').filter(Boolean) ?? []) {
			state.sources.add(source);
		}
		for (const button of sourceButtons) {
			button.setAttribute('aria-pressed', String(state.sources.has(button.dataset.sourceId!)));
		}
	}

	function toggle(set: Set<string>, value: string, el: HTMLElement) {
		if (set.has(value)) set.delete(value);
		else set.add(value);
		el.setAttribute('aria-pressed', String(set.has(value)));
	}

	// --- wiring ---

	let debounce: ReturnType<typeof setTimeout>;
	searchInput.addEventListener('input', () => {
		clearTimeout(debounce);
		debounce = setTimeout(() => {
			state.q = searchInput.value.trim().toLowerCase();
			apply();
		}, 120);
	});

	searchWrap?.querySelector('.search-clear')?.addEventListener('click', () => {
		searchInput.value = '';
		state.q = '';
		searchInput.focus();
		apply();
	});

	for (const tab of catTabs) {
		tab.addEventListener('click', () => {
			state.category = tab.dataset.category!;
			apply();
		});
	}

	for (const chip of rangeChips) {
		chip.addEventListener('click', () => {
			state.range = chip.dataset.range!;
			for (const other of rangeChips) {
				other.setAttribute('aria-pressed', String(other === chip));
			}
			apply();
		});
	}

	for (const chip of tagChips) {
		chip.addEventListener('click', () => {
			toggle(state.tags, chip.dataset.tag!, chip);
			apply();
		});
	}

	for (const button of sourceButtons) {
		button.addEventListener('click', () => {
			toggle(state.sources, button.dataset.sourceId!, button);
			apply();
		});
	}

	for (const reset of sidebar.querySelectorAll<HTMLElement>('[data-reset]')) {
		reset.addEventListener('click', () => {
			const which = reset.dataset.reset;
			if (which === 'range') {
				state.range = 'all';
				for (const chip of rangeChips) {
					chip.setAttribute('aria-pressed', String(chip.dataset.range === 'all'));
				}
			} else if (which === 'tags') {
				state.tags.clear();
				for (const chip of tagChips) chip.setAttribute('aria-pressed', 'false');
			} else if (which === 'sources') {
				state.sources.clear();
				for (const button of sourceButtons) button.setAttribute('aria-pressed', 'false');
			}
			apply();
		});
	}

	const toggleButton = sidebar.querySelector<HTMLElement>('.filters-toggle');
	toggleButton?.addEventListener('click', () => {
		const collapsed = sidebar.dataset.collapsed !== 'false';
		sidebar.dataset.collapsed = String(!collapsed);
		toggleButton.setAttribute('aria-expanded', String(collapsed));
	});

	// `/` jumps to search, Escape leaves it.
	document.addEventListener('keydown', (event) => {
		if (event.key === '/' && document.activeElement !== searchInput) {
			event.preventDefault();
			sidebar.dataset.collapsed = 'false';
			searchInput.focus();
		} else if (event.key === 'Escape' && document.activeElement === searchInput) {
			searchInput.blur();
		}
	});

	restoreFromUrl();
	apply();
}

/**
 * Timestamps render as an absolute date server-side (it survives caching);
 * upgrade them to relative once we're on the client and know "now".
 */
function relativeTimes() {
	const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		['year', 365 * DAY_MS],
		['month', 30 * DAY_MS],
		['day', DAY_MS],
		['hour', 3_600_000],
		['minute', 60_000],
	];

	for (const el of document.querySelectorAll<HTMLElement>('time[data-ts]')) {
		const ts = Number(el.dataset.ts);
		if (!ts) continue;

		const diff = ts - Date.now();
		const abs = Math.abs(diff);

		if (abs < 60_000) {
			el.textContent = 'just now';
			continue;
		}
		for (const [unit, ms] of units) {
			if (abs >= ms) {
				el.textContent = rtf.format(Math.round(diff / ms), unit);
				break;
			}
		}
	}
}

relativeTimes();
