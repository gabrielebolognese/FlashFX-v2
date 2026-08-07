import type { Rect } from './types';

// Pure equal-spacing / smart-distribution snapping (Penpot's snap engine model).
// While a rect is dragged near a run of objects, this emits a snap correction that
// makes the gap equal — either centring between two neighbours, or matching an
// existing run gap — plus the gap segments to draw as "= px" badges. Runs once per
// axis; a SEPARATE producer from edge/centre alignment snap (the caller arbitrates
// by smallest correction, with alignment's tighter tolerance winning ties).
// Dependency-free + deterministic — proven by scripts/verify-equalgap.mjs.

/** A now-equal gap to annotate: an along-axis span at a cross-axis coordinate. */
export interface GapBadge {
  axis: 'x' | 'y';
  a1: number;    // along-axis start (world)
  a2: number;    // along-axis end (world)
  cross: number; // cross-axis coordinate (world) — badge sits here
  gap: number;   // the equal gap value (label)
}

export interface EqualGapSnap {
  /** Correction to add to the dragged rect's along-axis MIN edge to equalize. */
  delta: number;
  /** The gap segments (each equal gap in the run) to render with a px label. */
  badges: GapBadge[];
}

const aMin = (r: Rect, axis: 'x' | 'y') => (axis === 'x' ? r.x : r.y);
const aMax = (r: Rect, axis: 'x' | 'y') => (axis === 'x' ? r.x + r.w : r.y + r.h);
const aSize = (r: Rect, axis: 'x' | 'y') => (axis === 'x' ? r.w : r.h);
const cMin = (r: Rect, axis: 'x' | 'y') => (axis === 'x' ? r.y : r.x);
const cMax = (r: Rect, axis: 'x' | 'y') => (axis === 'x' ? r.y + r.h : r.x + r.w);

/** Cross-axis interval overlap of two rects (>0 means they're "in the same run"). */
const crossOverlap = (a: Rect, b: Rect, axis: 'x' | 'y') =>
  Math.min(cMax(a, axis), cMax(b, axis)) - Math.max(cMin(a, axis), cMin(b, axis));

/** Centre of the cross-axis overlap band between two rects (badge placement). */
const crossCenter = (a: Rect, b: Rect, axis: 'x' | 'y') =>
  (Math.max(cMin(a, axis), cMin(b, axis)) + Math.min(cMax(a, axis), cMax(b, axis))) / 2;

/**
 * Compute an equal-spacing snap for a dragged rect along one axis, or null when no
 * equal-gap opportunity is within tolerance. `tolerance` is in WORLD px (the caller
 * passes screen-px ÷ zoom, ~20px screen). Candidates are all OTHER rects; only those
 * whose cross-axis interval overlaps the dragged rect participate in the run.
 */
export function computeEqualGapSnap(
  dragged: Rect,
  candidates: Rect[],
  axis: 'x' | 'y',
  tolerance: number,
): EqualGapSnap | null {
  const near = candidates.filter((c) => crossOverlap(dragged, c, axis) > 0);
  const dMin = aMin(dragged, axis), dMax = aMax(dragged, axis), size = aSize(dragged, axis);
  const lt = near.filter((c) => aMax(c, axis) <= dMin).sort((a, b) => aMax(b, axis) - aMax(a, axis));
  const gt = near.filter((c) => aMin(c, axis) >= dMax).sort((a, b) => aMin(a, axis) - aMin(b, axis));
  const L = lt[0], R = gt[0];

  const options: EqualGapSnap[] = [];

  // Case A — centre between the two nearest neighbours (equidistant). The window is
  // DOUBLED because the free space is split in two (Penpot's `md-snap`).
  if (L && R) {
    const free = aMin(R, axis) - aMax(L, axis);
    const eqGap = (free - size) / 2;
    if (eqGap >= 0) {
      const targetMin = aMax(L, axis) + eqGap;
      const sideL = dMin - aMax(L, axis);
      const sideR = aMin(R, axis) - dMax;
      if (Math.abs(sideL - sideR) <= tolerance * 2) {
        options.push({
          delta: targetMin - dMin,
          badges: [
            { axis, a1: aMax(L, axis), a2: targetMin, cross: crossCenter(dragged, L, axis), gap: eqGap },
            { axis, a1: targetMin + size, a2: aMin(R, axis), cross: crossCenter(dragged, R, axis), gap: eqGap },
          ],
        });
      }
    }
  }

  // Case B — match the existing gap between the two nearest LEFT neighbours.
  if (L && lt[1]) {
    const g = aMin(L, axis) - aMax(lt[1], axis);
    const sideL = dMin - aMax(L, axis);
    if (g >= 0 && Math.abs(sideL - g) <= tolerance) {
      const targetMin = aMax(L, axis) + g;
      options.push({
        delta: targetMin - dMin,
        badges: [
          { axis, a1: aMax(lt[1], axis), a2: aMin(L, axis), cross: crossCenter(L, lt[1], axis), gap: g },
          { axis, a1: aMax(L, axis), a2: targetMin, cross: crossCenter(dragged, L, axis), gap: g },
        ],
      });
    }
  }

  // Case C — match the existing gap between the two nearest RIGHT neighbours.
  if (R && gt[1]) {
    const g = aMin(gt[1], axis) - aMax(R, axis);
    const sideR = aMin(R, axis) - dMax;
    if (g >= 0 && Math.abs(sideR - g) <= tolerance) {
      const targetMax = aMin(R, axis) - g;
      options.push({
        delta: (targetMax - size) - dMin,
        badges: [
          { axis, a1: targetMax, a2: aMin(R, axis), cross: crossCenter(dragged, R, axis), gap: g },
          { axis, a1: aMax(R, axis), a2: aMin(gt[1], axis), cross: crossCenter(R, gt[1], axis), gap: g },
        ],
      });
    }
  }

  if (options.length === 0) return null;
  options.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta)); // smallest correction wins
  return options[0];
}
