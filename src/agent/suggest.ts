// B67 (follow-up) - "did you mean" hints for agent errors. Pure: no store, no DOM.
//
// Agents (and people typing in the console) mistype action ids, argument names and enum values; a
// one-line hint saves a failed round trip. Matching: exact case-insensitive / separator-insensitive
// hit first, then the closest candidate by edit distance when it is close enough to be a typo.

const norm = (s: string): string => s.toLowerCase().replace(/[\s_.-]+/g, '');

/** Levenshtein distance (small strings only: ids, param names, enum values). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * The candidates `input` most likely meant, best first (at most `max`). Empty when nothing is close.
 * For dotted ids ("editor.addKeyframe") the part after the last dot is also compared on its own, so
 * "agent.setKeyframes" suggests "editor.setKeyframes".
 */
export function suggestNames(input: string, candidates: readonly string[], max = 3): string[] {
  if (typeof input !== 'string' || !input) return [];
  const q = norm(input);
  const qTail = norm(input.slice(input.lastIndexOf('.') + 1));
  const scored: { c: string; d: number }[] = [];
  for (const c of candidates) {
    const n = norm(c);
    const tail = norm(c.slice(c.lastIndexOf('.') + 1));
    if (n === q) return [c];
    let d = editDistance(q, n);
    if (qTail && tail) d = Math.min(d, editDistance(qTail, tail) + (qTail === q ? 0 : 1));
    if (n.includes(q) || (qTail.length >= 4 && tail.includes(qTail))) d = Math.min(d, 1 + Math.abs(n.length - q.length) / 8);
    const limit = Math.max(2, Math.floor(Math.min(q.length, n.length) / 3));
    if (d <= limit) scored.push({ c, d });
  }
  scored.sort((x, y) => x.d - y.d || x.c.localeCompare(y.c));
  return scored.slice(0, max).map((s) => s.c);
}

/** " (did you mean X or Y?)" or "" - ready to append to an error message. */
export function didYouMean(input: string, candidates: readonly string[], max = 3): string {
  const s = suggestNames(input, candidates, max);
  if (!s.length) return '';
  return ` (did you mean ${s.length === 1 ? `"${s[0]}"` : s.slice(0, -1).map((x) => `"${x}"`).join(', ') + ` or "${s[s.length - 1]}"`}?)`;
}

/** "no layer with id X" plus the nearest ids / a matching layer NAME, so a wrong id costs one round trip, not a hunt. */
export function missingLayerMessage(layerId: unknown, layers: readonly { id: string; name: string }[]): string {
  const id = String(layerId);
  const byName = layers.filter((l) => l.name === id);
  if (byName.length) return `no layer with id "${id}"; that is a layer NAME: use its id ${byName.slice(0, 3).map((l) => `"${l.id}"`).join(' / ')}`;
  return `no layer with id "${id}" in the open composition (${layers.length} layers; getState().layers lists them)${didYouMean(id, layers.map((l) => l.id), 2)}`;
}
