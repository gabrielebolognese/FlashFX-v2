// B16-gpu - pure SDF shading math for the glowing beam / lightning render. The isolated WGSL beam
// pipeline (B16-gpu-render, browser-gated) MIRRORS these functions exactly, so the core/glow/tonemap
// falloff is node-testable here (verify:beam) even though the on-GPU pixels are browser-only. Leaf module,
// no imports. Works in any consistent 2D space (the shader passes fragment coords + the beam polyline in
// the same space). Pairs with beamGeometry.ts (which builds the polyline); this shades a point against it.

export interface Pt { x: number; y: number }

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** GLSL/WGSL-style smoothstep (Hermite), matching the shader's `smoothstep`. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (Math.abs(edge1 - edge0) < 1e-9) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Distance from point (px,py) to the segment [(ax,ay),(bx,by)] (endpoints clamped). */
export function sdSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const pax = px - ax, pay = py - ay;
  const bax = bx - ax, bay = by - ay;
  const denom = bax * bax + bay * bay;
  const h = denom > 1e-12 ? clamp01((pax * bax + pay * bay) / denom) : 0;
  const dx = pax - bax * h, dy = pay - bay * h;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Signed capsule-chain distance: the minimum distance from p to any segment of the polyline `points`,
 * minus `halfWidth`. Negative inside the beam radius, 0 on the surface, positive outside. A single point
 * (or empty) yields a large distance (nothing to draw). This is the core SDF the shader minimises over
 * its fixed segment array.
 */
export function capsuleChainDistance(px: number, py: number, points: Pt[], halfWidth: number): number {
  if (points.length < 2) return 1e9;
  let best = 1e9;
  for (let i = 0; i < points.length - 1; i++) {
    const d = sdSegment(px, py, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    if (d < best) best = d;
  }
  return best - halfWidth;
}

/**
 * Hot core coverage 0..1 from the signed capsule distance `d`: 1 well inside `coreHW`, easing to 0 across
 * an antialiasing band `aa` (use fwidth(d) in the shader). Monotonic non-increasing in d.
 */
export function coreCoverage(d: number, coreHW: number, aa: number): number {
  const a = Math.max(aa, 1e-6);
  return 1 - smoothstep(coreHW - a, coreHW + a, d);
}

/**
 * Colored-spread glow at signed distance `d` (outside the core): an inverse-square falloff 1/(1 + d^2*k).
 * 1 at/inside the surface, decaying with distance; `k` tightens the halo. Distance is clamped at 0 so the
 * interior reads as full glow. Always positive.
 */
export function glowFalloff(d: number, k: number): number {
  const dd = Math.max(d, 0);
  return 1 / (1 + dd * dd * Math.max(k, 0));
}

/**
 * Filmic-ish exposure tonemap of an accumulated (possibly >1) HDR channel: 1 - exp(-c*exposure). Maps
 * [0,inf) into [0,1) so a hot additive core resolves to near-white without hard 8-bit clipping. Monotonic;
 * negatives clamp to 0.
 */
export function tonemap(c: number, exposure: number): number {
  return 1 - Math.exp(-Math.max(0, c) * Math.max(0, exposure));
}
