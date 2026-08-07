// Pure fuzzy subsequence matcher + ranker for the command palette. Dependency-free
// + deterministic (scripts/verify-fuzzy.mjs). A query matches a target if its chars
// appear in order (subsequence); the score rewards matches at the start, after a
// separator/CamelCase boundary, and in consecutive runs, and lightly penalizes gaps
// and long targets — so "al" ranks "Align Left" above "Duplicate".

const SEP = /[\s\-_/.]/;
const isUpper = (c: string) => c >= 'A' && c <= 'Z';

/**
 * Greedy fuzzy score of `query` against `target`, or null when `query` is not a
 * subsequence. Empty query scores 0 (matches everything). Case-insensitive.
 */
export function fuzzyScore(query: string, target: string): number | null {
  if (query.length === 0) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    let found = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] === c) { found = j; break; }
    }
    if (found === -1) return null;
    score += 1;
    if (found === prev + 1) score += 5;                                  // consecutive run
    if (found === 0) score += 10;                                        // very start
    else if (SEP.test(t[found - 1])) score += 7;                         // after a separator
    else if (isUpper(target[found]) && !isUpper(target[found - 1])) score += 5; // CamelCase boundary
    score -= (found - ti) * 0.3;                                         // gap penalty
    prev = found;
    ti = found + 1;
  }
  score -= t.length * 0.01;                                              // mild short-target preference
  return score;
}

export interface Rankable { label: string; keywords?: string }

/**
 * Filter + rank items by a query against `label` (and optional `keywords`). Returns
 * items sorted best-first. An empty query returns all items in their original order.
 */
export function rankItems<T extends Rankable>(query: string, items: T[]): T[] {
  const trimmed = query.trim();
  if (trimmed === '') return items;
  const scored: { item: T; score: number; i: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const labelScore = fuzzyScore(trimmed, it.label);
    const kwScore = it.keywords ? fuzzyScore(trimmed, it.keywords) : null;
    let best: number | null = null;
    if (labelScore !== null) best = labelScore;
    // keyword matches count, but a label match is worth more (small penalty).
    if (kwScore !== null) { const kw = kwScore - 3; best = best === null ? kw : Math.max(best, kw); }
    if (best !== null) scored.push({ item: it, score: best, i });
  }
  scored.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  return scored.map((s) => s.item);
}
