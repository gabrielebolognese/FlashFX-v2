// Pure decision for the global decode-cursor budget (PB5). Browsers refuse new hardware VideoDecoders
// past ~16 across the page, after which decodes error and frames go black. Each open mediabunny cursor
// holds one decoder, and cursors scale with the number of distinct video assets (no cap otherwise), so
// once the open-cursor count exceeds a safe budget we tear down the least-recently-used ones. This
// function just decides WHICH to evict (by ascending lastSeq = LRU); the controller does the teardown,
// which is fail-open (an evicted cursor simply reseeks on next use).

/**
 * Given each open cursor's `lastSeq` (higher = more recently used) and a `budget`, return the indices
 * (into the input array) of the least-recently-used cursors to evict so at most `budget` remain.
 * Indices are returned in DESCENDING order so the caller can splice a shared array safely. Returns []
 * when already at or under budget, or when budget is not positive-finite is treated as "evict none".
 */
export function cursorsToEvict(lastSeqs: number[], budget: number): number[] {
  if (!Number.isFinite(budget) || budget < 0) return [];
  const excess = lastSeqs.length - budget;
  if (excess <= 0) return [];
  const order = lastSeqs.map((s, i) => ({ s, i })).sort((a, b) => (a.s - b.s) || (a.i - b.i)); // LRU first, stable
  return order.slice(0, excess).map((e) => e.i).sort((a, b) => b - a); // descending
}
