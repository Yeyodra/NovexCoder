import Fuse from "fuse.js";

export interface FuzzySearchOptions {
  threshold?: number;
  distance?: number;
  ignoreLocation?: boolean;
  preferSubstring?: boolean;
}

const DEFAULT_FUZZY_OPTIONS: Required<FuzzySearchOptions> = {
  threshold: 0.4,
  distance: 100,
  ignoreLocation: true,
  preferSubstring: true,
};

/**
 * Check if a single string matches a fuzzy query.
 */
export function matchesFuzzyQuery(
  target: string,
  query: string,
  options?: FuzzySearchOptions
): boolean {
  if (!query) return true;
  if (!target) return false;

  const merged = { ...DEFAULT_FUZZY_OPTIONS, ...options };

  if (merged.preferSubstring && target.toLowerCase().includes(query.toLowerCase())) {
    return true;
  }

  const fuse = new Fuse([target], {
    threshold: merged.threshold,
    distance: merged.distance,
    ignoreLocation: merged.ignoreLocation,
  });

  return fuse.search(query).length > 0;
}

/**
 * Filter items by fuzzy query. Returns only matching items.
 */
export function filterByFuzzyQuery<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  options?: FuzzySearchOptions
): T[] {
  if (!query) return items;

  const merged = { ...DEFAULT_FUZZY_OPTIONS, ...options };
  const queryLower = query.toLowerCase();
  const matching: T[] = [];
  const fuzzyCandidateTexts: string[] = [];
  const fuzzyCandidateIndices: number[] = [];

  for (let i = 0; i < items.length; i++) {
    const target = getText(items[i]);
    if (!target) continue;

    if (merged.preferSubstring && target.toLowerCase().includes(queryLower)) {
      matching.push(items[i]);
      continue;
    }

    fuzzyCandidateTexts.push(target);
    fuzzyCandidateIndices.push(i);
  }

  if (fuzzyCandidateTexts.length > 0) {
    const fuse = new Fuse(fuzzyCandidateTexts, {
      threshold: merged.threshold,
      distance: merged.distance,
      ignoreLocation: merged.ignoreLocation,
    });

    for (const result of fuse.search(query)) {
      matching.push(items[fuzzyCandidateIndices[result.refIndex]]);
    }
  }

  return matching;
}

/**
 * Score-sorted fuzzy ranking. Prioritizes substring/prefix matches,
 * then falls back to Fuse.js scoring. Returns top N results sorted by relevance.
 *
 * Use for command-palette-style result ranking where order matters.
 */
export function scoreByFuzzyQuery<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  options?: { limit?: number; threshold?: number },
): { item: T; score: number }[] {
  if (!query) return items.map((item) => ({ item, score: 0 }));

  const limit = options?.limit ?? items.length;
  const threshold = options?.threshold ?? 0.3;
  const queryLower = query.toLowerCase();

  const scored: { item: T; score: number }[] = [];
  const fuzzyCandidates: { item: T; text: string }[] = [];

  for (const item of items) {
    const text = getText(item);
    if (!text) continue;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(queryLower);
    if (idx === 0) {
      scored.push({ item, score: -1 }); // prefix match = best
      continue;
    }
    if (idx > 0) {
      scored.push({ item, score: idx / 1000 }); // substring match
      continue;
    }
    fuzzyCandidates.push({ item, text });
  }

  if (fuzzyCandidates.length > 0) {
    const fuse = new Fuse(
      fuzzyCandidates.map((c) => c.text),
      { threshold, ignoreLocation: true, distance: 100, includeScore: true, minMatchCharLength: 2 },
    );
    for (const result of fuse.search(query)) {
      scored.push({ item: fuzzyCandidates[result.refIndex].item, score: result.score ?? 1 });
    }
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit);
}

/**
 * Convenience: returns just the items ranked by fuzzy score.
 */
export function rankByFuzzyQuery<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  options?: { limit?: number; threshold?: number },
): T[] {
  return scoreByFuzzyQuery(items, query, getText, options).map((x) => x.item);
}

/**
 * Factory to create a reusable fuzzy searcher for a static list.
 */
export function createFuzzySearcher<T>(items: T[], keys: string[]) {
  const fuse = new Fuse(items, {
    keys,
    threshold: 0.4,
    distance: 100,
    ignoreLocation: true,
    includeScore: true,
  });

  return {
    search(query: string, limit?: number): T[] {
      if (!query) return items.slice(0, limit);
      const results = fuse.search(query, limit ? { limit } : undefined);
      return results.map((r) => r.item);
    },
    updateItems(newItems: T[]) {
      fuse.setCollection(newItems);
    },
  };
}
