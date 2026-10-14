// Refine Edge (B10e): a colour-aware pass over the matte edge of an image / video layer's masks - the
// "basic roto refine" step. The mask stack gives a combined signed distance + outward normal at every
// pixel (core/maskCoverage.ts maskStackField, WGSL computeMaskStack). Inside a band of `radius` px
// around that edge, the pixel's alpha is re-estimated from the footage: the foreground colour F is
// sampled just inside the edge, the background colour B just outside (both along the normal, averaged
// over three taps along the edge), and the pixel colour C is projected onto the B -> F line
// (alpha = (C - B).(F - B) / |F - B|^2, the closed-form two-colour matting estimate). A rough roto then
// snaps to the subject's real edge and keeps soft detail; where F and B are too similar to tell apart
// the geometric mask alpha is kept. Decontamination solves C = aF + (1 - a)B for the foreground colour
// and moves edge pixels toward it, stripping the old background's colour from the fringe.
//
// This file is the CPU twin of engine/refineWgsl.ts (the WGSL the image shader runs) - keep the two
// in lockstep; `verify:refine-edge` checks the math and `npm run gpu:masks` checks GPU == CPU. Pure and
// frame-pure (a function of the pixel, the mask field and the source image only).

import type { RefineEdge } from './types';

export const REFINE_RADIUS_MIN = 1;
export const REFINE_RADIUS_MAX = 64;
export const DEFAULT_REFINE_EDGE: RefineEdge = { enabled: true, radius: 8, contrast: 0.25, decontaminate: 0.5 };

/** |F - B| (RGB distance, 0..sqrt 3) below LO: no contrast to classify by, keep the mask alpha. */
export const REFINE_CONF_LO = 0.04;
export const REFINE_CONF_HI = 0.16;
/** The band's influence fades out between BAND_FADE * radius and radius (no seam at the band edge). */
export const REFINE_BAND_FADE = 0.6;
/** contrast 1 multiplies the alpha slope around 0.5 by 1 + GAIN. */
export const REFINE_CONTRAST_GAIN = 4;
/** Decontamination: the solved foreground colour is trusted from SOLVE_LO..SOLVE_HI alpha up (below it
 *  the sampled F is used); the solve divides by at least SOLVE_MIN_ALPHA. */
export const REFINE_SOLVE_LO = 0.15;
export const REFINE_SOLVE_HI = 0.6;
export const REFINE_SOLVE_MIN_ALPHA = 0.05;

export type RGB = [number, number, number];

/** The combined mask stack at a point: coverage, signed distance (inside < 0) and unit outward normal. */
export interface MaskField {
  alpha: number;
  sd: number;
  gx: number;
  gy: number;
}

export interface RefineParams {
  radius: number;
  contrast: number;
  decontaminate: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Clamp a refine setting into its legal ranges (radius 1..64 px, contrast / decontaminate 0..1). */
export function clampRefineEdge(r: RefineEdge): RefineEdge {
  return {
    enabled: r.enabled === true,
    radius: clamp(num(r.radius, DEFAULT_REFINE_EDGE.radius), REFINE_RADIUS_MIN, REFINE_RADIUS_MAX),
    contrast: clamp(num(r.contrast, DEFAULT_REFINE_EDGE.contrast), 0, 1),
    decontaminate: clamp(num(r.decontaminate, DEFAULT_REFINE_EDGE.decontaminate), 0, 1),
  };
}

/** Persistence: an untrusted blob -> a valid RefineEdge (undefined when it is not an object). */
export function sanitizeRefineEdge(raw: unknown): RefineEdge | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  return clampRefineEdge({
    enabled: r.enabled === true,
    radius: num(r.radius, DEFAULT_REFINE_EDGE.radius),
    contrast: num(r.contrast, DEFAULT_REFINE_EDGE.contrast),
    decontaminate: num(r.decontaminate, DEFAULT_REFINE_EDGE.decontaminate),
  });
}

/** The setting the renderer sees this frame: undefined unless enabled AND there is a mask edge to refine. */
export function resolveRefineEdge(r: RefineEdge | undefined, maskCount: number): RefineEdge | undefined {
  if (!r || r.enabled !== true || maskCount <= 0) return undefined;
  return clampRefineEdge(r);
}

/** Uniform floats (radius, contrast, decontaminate); radius 0 = refine off (the shader's switch). */
export function packRefineEdge(r: RefineEdge | undefined): [number, number, number] {
  return r ? [r.radius, r.contrast, r.decontaminate] : [0, 0, 0];
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Two-colour matting estimate: where C sits on the B -> F line (0 = background, 1 = foreground). */
export function classifyAlpha(c: RGB, f: RGB, b: RGB): number {
  const fb: RGB = [f[0] - b[0], f[1] - b[1], f[2] - b[2]];
  const len2 = fb[0] * fb[0] + fb[1] * fb[1] + fb[2] * fb[2];
  const dot = (c[0] - b[0]) * fb[0] + (c[1] - b[1]) * fb[1] + (c[2] - b[2]) * fb[2];
  return clamp(dot / Math.max(len2, 1e-6), 0, 1);
}

/** Contrast around alpha 0.5 (0 = unchanged, 1 = slope x5). */
export function contrastAlpha(a: number, contrast: number): number {
  return clamp((a - 0.5) * (1 + REFINE_CONTRAST_GAIN * contrast) + 0.5, 0, 1);
}

/** How much the colour estimate is trusted: 0 when F ~ B, 1 once they clearly differ. */
export function refineConfidence(f: RGB, b: RGB): number {
  return smoothstep(REFINE_CONF_LO, REFINE_CONF_HI, Math.hypot(f[0] - b[0], f[1] - b[1], f[2] - b[2]));
}

/** Band weight at signed distance `sd`: 1 near the edge, fading to 0 at `radius`. */
export function bandWeight(sd: number, radius: number): number {
  return 1 - smoothstep(radius * REFINE_BAND_FADE, radius, Math.abs(sd));
}

/** Estimated foreground colour of an edge pixel (C = aF + (1 - a)B solved for F, blended to sampled F at low a). */
export function decontaminatedColor(c: RGB, f: RGB, b: RGB, aRaw: number): RGB {
  const k = smoothstep(REFINE_SOLVE_LO, REFINE_SOLVE_HI, aRaw);
  const div = Math.max(aRaw, REFINE_SOLVE_MIN_ALPHA);
  const out: RGB = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const solved = clamp((c[i] - (1 - aRaw) * b[i]) / div, 0, 1);
    out[i] = f[i] * (1 - k) + solved * k;
  }
  return out;
}

const avg3 = (a: RGB, b: RGB, c: RGB): RGB => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];

/**
 * The refined matte at composition point (x, y): `alpha` replaces the mask alpha and `delta` is added
 * to the output colour (decontamination). Outside the band, or without a usable normal, the field's own
 * alpha comes back unchanged with a zero delta. `sample(x, y)` reads the layer's source colour at a
 * composition point. Line-for-line twin of WGSL `refineEdgeAt`.
 */
export function refineEdgeAt(
  x: number,
  y: number,
  field: MaskField,
  params: RefineParams,
  sample: (x: number, y: number) => RGB,
): { alpha: number; delta: RGB } {
  const R = params.radius;
  const sd = field.sd;
  const nx = field.gx, ny = field.gy;
  if (!(R > 0) || Math.abs(sd) >= R || nx * nx + ny * ny < 0.25) return { alpha: field.alpha, delta: [0, 0, 0] };
  const ex = x - nx * sd, ey = y - ny * sd;
  const tx = -ny * (R * 0.5), ty = nx * (R * 0.5);
  const fx = ex - nx * R, fy = ey - ny * R;
  const bx = ex + nx * R, by = ey + ny * R;
  const F = avg3(sample(fx - tx, fy - ty), sample(fx, fy), sample(fx + tx, fy + ty));
  const B = avg3(sample(bx - tx, by - ty), sample(bx, by), sample(bx + tx, by + ty));
  const C = sample(x, y);
  const aRaw = classifyAlpha(C, F, B);
  const aC = contrastAlpha(aRaw, params.contrast);
  const w = bandWeight(sd, R) * refineConfidence(F, B);
  const alpha = field.alpha * (1 - w) + aC * w;
  const fEst = decontaminatedColor(C, F, B, aRaw);
  const s = params.decontaminate * w;
  return { alpha, delta: [(fEst[0] - C[0]) * s, (fEst[1] - C[1]) * s, (fEst[2] - C[2]) * s] };
}
