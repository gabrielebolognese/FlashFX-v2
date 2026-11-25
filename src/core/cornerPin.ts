// Corner pin (B53) - pin a layer's four corners to four comp-space points (AE "Corner Pin", the
// classic keystone / "screen inside a tilted phone" warp). Pure: reuses the B27 homography solver
// (core/tracking/homography.ts - never a second implementation) and folds the projective map into a
// 4x4 clip-space matrix, so the renderer draws a pinned layer through the SAME `mvp` vertex path the
// 2.5D cards use (perspective-correct UV interpolation on the GPU = exact projective texture warp).
// Verified by verify:corner-pin (maths) and gpu:camera-cards (real renderer pixels).

import type { Mat4 } from './mat4';
import { computeHomography, type Homography, type Pt, type Quad } from './tracking/homography';

/** Corner order everywhere: top-left, top-right, bottom-right, bottom-left. */
export type CornerPinQuad = Quad;

export const CORNER_PIN_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
export type CornerPinKey = (typeof CORNER_PIN_KEYS)[number];

/** The axis-aligned source box (layer-local px, centred on (cx, cy)) in pin order. */
export function cornerPinSourceQuad(cx: number, cy: number, w: number, h: number): CornerPinQuad {
  const hw = w / 2, hh = h / 2;
  return [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]];
}

const cross = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** True when the quad is strictly convex (either winding) with a non-trivial area. A bow-tie or a
 *  concave / collinear pin set has no sensible projective warp, so it is rejected. */
export function isConvexQuad(q: CornerPinQuad): boolean {
  if (!q.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (Math.abs(c) < 1e-6) return false;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** The homography mapping the source box onto the pins, or null for a degenerate / non-convex pin
 *  set (the renderer then draws the layer unpinned). Normalised so w > 0 over the source quad. */
export function cornerPinHomography(src: CornerPinQuad, dst: CornerPinQuad): Homography | null {
  if (!isConvexQuad(src) || !isConvexQuad(dst)) return null;
  const H = computeHomography(src, dst);
  // computeHomography falls back to identity when singular; a real pin set never solves to identity
  // unless src == dst, so check the corners actually land.
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const w = H[6] * x + H[7] * y + H[8];
    if (!(Math.abs(w) > 1e-9)) return null;
    const u = (H[0] * x + H[1] * y + H[2]) / w, v = (H[3] * x + H[4] * y + H[5]) / w;
    if (Math.abs(u - dst[i][0]) > 1e-4 || Math.abs(v - dst[i][1]) > 1e-4) return null;
  }
  // A convex pin set maps the convex source with w of one sign at every corner; make it positive so
  // the GPU never clips the quad (w <= 0 is behind the "eye").
  const w0 = H[6] * src[0][0] + H[7] * src[0][1] + H[8];
  for (let i = 1; i < 4; i++) {
    const wi = H[6] * src[i][0] + H[7] * src[i][1] + H[8];
    if (Math.sign(wi) !== Math.sign(w0)) return null;
  }
  return w0 < 0 ? (H.map((v) => -v) as Homography) : H;
}

/**
 * Column-major clip-space matrix for a pinned layer: multiply the layer-local vertex (x, y, 0, 1) by it
 * and the GPU's perspective divide lands it at H·(x, y) in comp px, mapped to NDC exactly like the 2D
 * path (ndc = (2X/W - 1, 1 - 2Y/H)). z = 0 (the flat pipelines' depth). null when the pins are invalid.
 */
export function cornerPinMatrix(src: CornerPinQuad, dst: CornerPinQuad, compW: number, compH: number): Mat4 | null {
  const H = cornerPinHomography(src, dst);
  if (!H) return null;
  const sx = 2 / compW, sy = 2 / compH;
  return [
    sx * H[0] - H[6], H[6] - sy * H[3], 0, H[6],
    sx * H[1] - H[7], H[7] - sy * H[4], 0, H[7],
    0, 0, 0, 0,
    sx * H[2] - H[8], H[8] - sy * H[5], 0, H[8],
  ];
}
