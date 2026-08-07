import type { Rect } from './types';

// Pure edge-to-edge gap measurement between two world-space bounding boxes, for
// the Alt-hover "measure distance" overlay (Figma/Sketch model). Dependency-free +
// deterministic — proven by scripts/verify-measure.mjs. Rendering (red lines, dashed
// extension guides, label pills) lives in the overlay; this file is just geometry.

export interface GapSegment {
  /** 'x' → a horizontal gap (the solid segment runs left↔right, y1===y2);
   *  'y' → a vertical gap (segment runs top↔bottom, x1===x2). */
  axis: 'x' | 'y';
  /** Edge-to-edge distance in world px (≥ 0; a segment is emitted only when the
   *  two rects are SEPARATED on this axis, so overlaps produce no segment in v1). */
  gap: number;
  /** Solid gap-segment endpoints (world space). */
  x1: number; y1: number; x2: number; y2: number;
  /** Formatted label (integer when whole, else ≤2 decimals, trailing zeros stripped). */
  label: string;
}

/** Format a px gap: integer when whole, otherwise up to 2 decimals with trailing
 *  zeros stripped. Normalizes -0 → "0". */
export function fmtGap(v: number): string {
  const r = Math.round(v * 100) / 100;
  if (Number.isInteger(r)) return String(r === 0 ? 0 : r);
  return r.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Edge-to-edge gap segments from a selected rect to a hovered rect. A horizontal
 * segment is emitted iff the two are separated on X, and a vertical segment iff
 * separated on Y — so an axis-aligned pair shows one segment, a diagonally-offset
 * pair shows both, and an overlapping pair shows none (v1 skips signed overlap).
 * Each segment's cross-axis coordinate sits at the centre of the shared band when
 * the rects overlap on that axis, otherwise midway between their centres.
 */
export function measureGaps(sel: Rect, hov: Rect): GapSegment[] {
  const segs: GapSegment[] = [];
  const selR = sel.x + sel.w, selB = sel.y + sel.h;
  const hovR = hov.x + hov.w, hovB = hov.y + hov.h;

  // Horizontal gap (along X) — only when the X ranges don't overlap.
  let xGap: number | null = null, xa = 0, xb = 0;
  if (hov.x >= selR) { xGap = hov.x - selR; xa = selR; xb = hov.x; }        // hover to the right
  else if (sel.x >= hovR) { xGap = sel.x - hovR; xa = hovR; xb = sel.x; }   // hover to the left
  if (xGap !== null) {
    const top = Math.max(sel.y, hov.y), bot = Math.min(selB, hovB);
    const y = bot > top ? (top + bot) / 2 : (sel.y + selB + hov.y + hovB) / 4;
    segs.push({ axis: 'x', gap: xGap, x1: xa, y1: y, x2: xb, y2: y, label: fmtGap(xGap) });
  }

  // Vertical gap (along Y) — only when the Y ranges don't overlap.
  let yGap: number | null = null, ya = 0, yb = 0;
  if (hov.y >= selB) { yGap = hov.y - selB; ya = selB; yb = hov.y; }        // hover below
  else if (sel.y >= hovB) { yGap = sel.y - hovB; ya = hovB; yb = sel.y; }   // hover above
  if (yGap !== null) {
    const left = Math.max(sel.x, hov.x), right = Math.min(selR, hovR);
    const x = right > left ? (left + right) / 2 : (sel.x + selR + hov.x + hovR) / 4;
    segs.push({ axis: 'y', gap: yGap, x1: x, y1: ya, x2: x, y2: yb, label: fmtGap(yGap) });
  }

  return segs;
}
