// B63 - the numbers the SDF shape pipeline (RECT_SHADER in engine/renderer.ts) draws a rectangle /
// ellipse / star from, computed from the resolved shape and the layer's scale. Pure leaf module (types
// only), so `verify:shape-render` bundles it standalone and proves the geometry the GPU gets:
//  - the quad is padded by half the stroke + an anti-aliasing margin, so a centred stroke is never cut
//    at the shape bounds (rings used to get flat sides, pill outlines lost their ends); an unstroked
//    rectangle keeps its exact quad (byte-identical to before);
//  - a circle is drawn at its true radius (it used to be 10% larger: the old 1.1x SDF margin was also
//    read as the radius), and as an ellipse when its two radii differ (CircleShape.radiusY) or the
//    layer scale is non-uniform (it used to render a circle at the smaller scale);
//  - corner radii scale with the layer (an unscaled radius on a scaled-down rect drew lens-shaped ends)
//    and are clamped to half the short side (above it the SDF drew pointed ends or nothing at all).
// `ellipseDistance` is the CPU twin of the WGSL ellipseSDF.

import type { ResolvedShape } from './types';

/** Extra quad margin (px) beyond the stroke so the SDF's anti-aliased edge is never clipped. */
export const SDF_AA_MARGIN = 2;

/** RECT_SHADER shapeType ids. */
export const SDF_RECT = 0;
export const SDF_ELLIPSE = 1;
export const SDF_STAR = 2;

export interface ShapeSdfParams {
  /** 0 rounded rect, 1 ellipse (a circle when both semi-axes match), 2 star. */
  shapeType: number;
  /** The shape box in comp px, signed (a negative scale mirrors it). */
  boxW: number;
  boxH: number;
  /** Rect corner radii [tl, tr, br, bl] in comp px, scaled with the layer and clamped. */
  radii: [number, number, number, number];
  /** Star [points, outer radius, inner radius] in comp px. */
  star: [number, number, number];
  /** Stroke width in comp px (never negative). */
  strokeWidth: number;
  /** Quad padding on every side (px): half the stroke + SDF_AA_MARGIN (0 for an unstroked rectangle). */
  pad: number;
}

const fin = (v: number, d = 0): number => (Number.isFinite(v) ? v : d);

/** Clamp each corner radius into [0, min(|w|, |h|) / 2]. */
export function clampCornerRadii(r: readonly [number, number, number, number], w: number, h: number): [number, number, number, number] {
  const max = Math.min(Math.abs(w), Math.abs(h)) / 2;
  const c = (v: number) => Math.min(Math.max(fin(v), 0), max);
  return [c(r[0]), c(r[1]), c(r[2]), c(r[3])];
}

export function shapeSdfParams(s: ResolvedShape, scaleX: number, scaleY: number): ShapeSdfParams {
  const sx = fin(scaleX, 1), sy = fin(scaleY, 1);
  const ax = Math.abs(sx), ay = Math.abs(sy);
  const minScale = Math.min(ax, ay);
  const boxW = fin(s.width) * sx;
  const boxH = fin(s.height) * sy;
  const sw = Math.max(0, fin(s.strokeWidth));
  let shapeType = SDF_RECT;
  let strokeWidth: number;
  let radii: [number, number, number, number] = [0, 0, 0, 0];
  let star: [number, number, number] = [0, 0, 0];
  let w = boxW, h = boxH;
  if (s.renderType === 'circle') {
    shapeType = SDF_ELLIPSE;
    // A circle has no single scale for its stroke under a non-uniform scale: the smaller one keeps the
    // authored width on a circle that addShapeLayer-style stretching turned into an ellipse.
    strokeWidth = sw * minScale;
  } else if (s.renderType === 'star') {
    shapeType = SDF_STAR;
    const outer = Math.abs(fin(s.outerRadius) * sx);
    star = [fin(s.points), outer, Math.abs(fin(s.innerRadius) * sx)];
    // The star SDF is radial: give it a square box of its outer radius (sy only mirrors).
    w = (sx < 0 ? -2 : 2) * outer;
    h = (sy < 0 ? -2 : 2) * outer;
    strokeWidth = sw * ax;
  } else {
    const cr = s.cornerRadii ?? [s.borderRadius, s.borderRadius, s.borderRadius, s.borderRadius];
    radii = clampCornerRadii([cr[0] * minScale, cr[1] * minScale, cr[2] * minScale, cr[3] * minScale], boxW, boxH);
    strokeWidth = sw * ax;
  }
  // An unstroked rectangle keeps its exact quad (pad 0), so every existing fill renders byte-identically
  // (its edge pixels were always cut at the box); strokes, ellipses and stars get the full margin.
  const pad = shapeType === SDF_RECT && strokeWidth <= 0 ? 0 : strokeWidth / 2 + SDF_AA_MARGIN;
  return { shapeType, boxW: w, boxH: h, radii, star, strokeWidth, pad };
}

/**
 * Signed distance from p to the ellipse with semi-axes (a, b) centred at the origin (negative inside).
 * Same algorithm as the WGSL ellipseSDF: the closest point by the trig-free fixed-point iteration (step
 * through the centre of curvature, 4 rounds), sign from the implicit equation; an exact circle below a
 * 1e-4 relative axis difference.
 */
export function ellipseDistance(px: number, py: number, a: number, b: number): number {
  const A = Math.max(a, 1e-4), B = Math.max(b, 1e-4);
  if (Math.abs(A - B) <= 1e-4 * Math.max(A, B)) return Math.hypot(px, py) - A;
  const qx = Math.abs(px), qy = Math.abs(py);
  const k = A * A - B * B;
  let tx = Math.SQRT1_2, ty = Math.SQRT1_2;
  for (let i = 0; i < 4; i++) {
    const x = A * tx, y = B * ty;
    const ex = (k * tx * tx * tx) / A, ey = (-k * ty * ty * ty) / B;
    const r = Math.hypot(x - ex, y - ey);
    const qex = qx - ex, qey = qy - ey;
    const ql = Math.max(Math.hypot(qex, qey), 1e-6);
    tx = Math.min(1, Math.max(0, ((qex * r) / ql + ex) / A));
    ty = Math.min(1, Math.max(0, ((qey * r) / ql + ey) / B));
    const tl = Math.max(Math.hypot(tx, ty), 1e-6);
    tx /= tl; ty /= tl;
  }
  const d = Math.hypot(qx - A * tx, qy - B * ty);
  const kk = (qx / A) * (qx / A) + (qy / B) * (qy / B);
  return kk < 1 ? -d : d;
}
