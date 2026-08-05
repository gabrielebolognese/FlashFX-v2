// Pure video-frame PRESENTATION policy for the audio-master playback model.
// Dependency-free + deterministic (scripts/verify-presentation).
//
// Playback shows "the latest decoded frame at or before the clock time" and drops
// the rest, never blocking. Selection is PER LAYER (a source frame the renderer
// already resolved for that layer via resolveVideoLayer), NOT per asset — two
// layers on the same asset (a split clip, slow-mo over its own footage) need
// different source indices in the same displayed frame.

/**
 * Pick the buffered source-frame index to DISPLAY for one layer whose current
 * continuous target source-frame is `target`.
 *
 * Precedence (see critique #4/#14):
 *   1. the greatest buffered index ≤ target, if within `maxDistance` frames of it;
 *   2. else HOLD the layer's `lastPresented` (if still buffered) — never jump to a
 *      future or far-behind frame, which would flash a wrong picture after a seek;
 *   3. else null → renderer holds its last texture / black.
 *
 * Never returns an index > target (would show the future) and never returns a
 * ≤-target index that is more than `maxDistance` stale (post-seek the ring may hold
 * only old-playhead frames).
 */
export function selectPresentFrame(
  buffered: readonly number[],
  target: number,
  lastPresented: number | null,
  maxDistance: number,
): number | null {
  let best = -Infinity;
  for (const idx of buffered) {
    if (idx <= target && idx > best) best = idx;
  }
  if (best !== -Infinity && target - best <= maxDistance) return best;
  if (lastPresented !== null && buffered.includes(lastPresented)) return lastPresented;
  return null;
}

/**
 * The per-asset DROP FLOOR: buffered frames with index < this are safe to close
 * (already played by every layer using the asset). It's the MINIMUM presented index
 * across all of the asset's active layer requirements — so a second layer that is
 * behind (e.g. the other half of a split clip) keeps its still-needed frames.
 * Returns null when nothing is presented yet (evict nothing).
 */
export function computeDropFloor(presentedIndices: readonly number[]): number | null {
  if (presentedIndices.length === 0) return null;
  let min = Infinity;
  for (const i of presentedIndices) if (i < min) min = i;
  return min;
}
