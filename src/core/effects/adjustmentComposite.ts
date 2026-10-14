// Adjustment-layer apply-below composite (B11b-gpu, pure leaf - imports types only).
//
// The renderer's adjust pass (the adjustment variant of IMAGE_SHADER in engine/renderer.ts) runs, per
// pixel of the accumulated composite BELOW the adjustment (premultiplied, as the scene texture stores it):
//   1. warp + spatial effects sample the premultiplied copy (filtering premultiplied colour is correct:
//      no dark fringes where the composite is transparent),
//   2. un-premultiply, then the basic filters + colour effects run on straight colour, exactly as they
//      do on an image layer,
//   3. clamp + re-premultiply,
//   4. (split plan only) the layer Blur, then the Glow, run over that result,
//   5. mix with the untouched below by k = clamp(opacity * maskAlpha, 0, 1).
// So opacity 0 / outside every mask returns the below byte-for-byte, and opacity 1 inside the masks
// replaces it with the adjusted composite (After Effects adjustment-layer semantics).
//
// This module is the CPU twin of steps 2, 3 and 5, the "does this adjustment do anything" test the
// coverage resolver uses, and the pass plan the renderer follows. Verified by
// verify:adjustment-composite; the WGSL is pixel-checked against it by gpu:adjustment.

import type { ImageFilters } from '../types';

export type RGBA = [number, number, number, number];

/** The adjust-variant shader modes (ImageUniforms.adjustMode). Shared by the renderer + its WGSL. */
export const ADJUST_MODE = {
  /** Effects + filters on the below copy, then mix with the below by k (single pass). */
  applyMix: 1,
  /** Effects + filters only; output the premultiplied result (no mix) - split plan, step 1. */
  applyOnly: 2,
  /** No effects; mix the already-effected texture with the below by k - split plan, last step. */
  mixOnly: 3,
} as const;

export const IDENTITY_FILTERS: ImageFilters = { brightness: 0, contrast: 0, saturation: 0, exposure: 0, gamma: 1 };

const finiteOr = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** An adjustment's basic filters with identity defaults filled in (the store's dot-path setter can
 *  leave a partial object; untrusted / non-finite values fall back to identity). */
export function resolveAdjustmentFilters(f: Partial<Record<keyof ImageFilters, unknown>> | undefined): ImageFilters {
  if (!f) return { ...IDENTITY_FILTERS };
  return {
    brightness: finiteOr(f.brightness, 0),
    contrast: finiteOr(f.contrast, 0),
    saturation: finiteOr(f.saturation, 0),
    exposure: finiteOr(f.exposure, 0),
    gamma: finiteOr(f.gamma, 1),
  };
}

export function isIdentityFilters(f: ImageFilters): boolean {
  return f.brightness === 0 && f.contrast === 0 && f.saturation === 0 && f.exposure === 0 && f.gamma === 1;
}

/** Does an adjustment change anything (given content below it)? Any enabled stack effect, a
 *  non-identity basic filter, or an enabled layer Blur / Glow. Drives the coverage `noOp` flag. */
export function adjustmentHasWork(a: { effectCount: number; filters: ImageFilters; blur: boolean; glow: boolean }): boolean {
  return a.effectCount > 0 || !isIdentityFilters(a.filters) || a.blur || a.glow;
}

/** The per-pixel mix weight: layer opacity times the mask-stack alpha, clamped to [0, 1]. */
export function adjustmentStrength(opacity: number, maskAlpha: number): number {
  const k = opacity * maskAlpha;
  return Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : 0;
}

export function premultiply(c: RGBA): RGBA {
  return [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]];
}

/** Straight colour from premultiplied; alpha at (or below) 1e-4 gives black (the WGSL `select`). */
export function unpremultiply(c: RGBA): RGBA {
  if (c[3] <= 1e-4) return [0, 0, 0, c[3]];
  return [c[0] / c[3], c[1] / c[3], c[2] / c[3], c[3]];
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Mix two premultiplied colours by k (k = 0 -> below exactly). */
export function mixPremultiplied(below: RGBA, effected: RGBA, k: number): RGBA {
  return [
    below[0] + (effected[0] - below[0]) * k,
    below[1] + (effected[1] - below[1]) * k,
    below[2] + (effected[2] - below[2]) * k,
    below[3] + (effected[3] - below[3]) * k,
  ];
}

/** The CPU twin of the image shader's basic-filter block (exposure, brightness, contrast, saturation,
 *  gamma - in that order, on straight rgb). */
export function applyBasicFilters(rgb: [number, number, number], f: ImageFilters): [number, number, number] {
  const e = Math.pow(2, f.exposure);
  let c = rgb.map((v) => v * e + f.brightness) as [number, number, number];
  const cf = 1 + f.contrast;
  c = c.map((v) => (v - 0.5) * cf + 0.5) as [number, number, number];
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const sf = 1 + f.saturation;
  c = c.map((v) => lum + (v - lum) * sf) as [number, number, number];
  const ig = 1 / Math.max(f.gamma, 0.01);
  return c.map((v) => Math.pow(Math.max(v, 0), ig)) as [number, number, number];
}

/**
 * One pixel of the single-pass (applyMix) adjust: un-premultiply the below, run `effect` on the
 * straight colour (filters + colour effects), clamp, re-premultiply, mix with the below by k.
 * (Warp / spatial effects move WHERE the colour is read from; for a pixel-local check they are the
 * identity, which is what the harnesses compare.)
 */
export function adjustPixel(belowPremult: RGBA, k: number, effect: (straight: RGBA) => RGBA): RGBA {
  const s = effect(unpremultiply(belowPremult));
  const a = clamp01(s[3]);
  const eff: RGBA = [clamp01(s[0]) * a, clamp01(s[1]) * a, clamp01(s[2]) * a, a];
  return mixPremultiplied(belowPremult, eff, clamp01(k));
}

/** How the renderer runs an adjustment this frame. A layer Blur or Glow needs the effected result in
 *  an intermediate texture before the mix (split = 2 uniform slots); otherwise one pass does it all. */
export interface AdjustmentPassPlan {
  split: boolean;
  blur: boolean;
  glow: boolean;
  /** Image-uniform slots the plan consumes (1 single, 2 split). */
  slots: number;
}

export function planAdjustmentPasses(a: { blur: boolean; glow: boolean }): AdjustmentPassPlan {
  const split = a.blur || a.glow;
  return { split, blur: a.blur, glow: a.glow, slots: split ? 2 : 1 };
}
