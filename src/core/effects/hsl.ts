// HSL secondary (B15-gpu slice) - pure RGB<->HSL colour-space math + a hue/sat/lightness adjust that can
// be gated to a hue RANGE ("secondary" colour correction: shift only the reds, only the skies, etc.). The
// live effect is a WGSL case in applyColorEffect that MIRRORS these functions, so the shader can only be
// browser-verified, but the colour math + the range mask are proven here (scripts/verify-hsl.mjs). Leaf
// module, no imports. All channels + h/s/l are 0..1; hue wraps.

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fract = (x: number) => x - Math.floor(x);

/** RGB (0..1) -> HSL (h,s,l all 0..1, h wrapping). Matches the standard conversion the WGSL mirrors. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l]; // achromatic
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  const tt = fract(t);
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/** HSL (0..1) -> RGB (0..1). Inverse of rgbToHsl. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

/** Circular distance between two hues on [0,1): 0..0.5. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(fract(a) - fract(b));
  return Math.min(d, 1 - d);
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  if (Math.abs(e1 - e0) < 1e-6) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export interface HslAdjust {
  /** Hue rotation, in turns (0..1 = 0..360deg); wraps. */
  hueShift: number;
  /** Saturation multiplier (1 = unchanged). */
  satScale: number;
  /** Lightness offset added (0 = unchanged). */
  lightAdd: number;
  /** Hue-range gate centre (0..1). Only used when rangeWidth < 1. */
  rangeCenter?: number;
  /** Half-width of the affected hue band (0..1). >= 1 (default) = global (affects every pixel). */
  rangeWidth?: number;
  /** Soft edge of the range gate (0..0.5). */
  rangeSoftness?: number;
}

/** The 0..1 mask for how much a pixel of hue `h` is affected: 1 globally, or a soft hue-range gate for
 *  secondary correction. */
export function hslRangeMask(h: number, opts: HslAdjust): number {
  const width = opts.rangeWidth ?? 1;
  if (width >= 1) return 1; // global
  const soft = Math.max(0, opts.rangeSoftness ?? 0.1);
  const d = hueDistance(h, opts.rangeCenter ?? 0);
  // inside half-width -> 1, easing to 0 by half-width + soft
  return 1 - smoothstep(width, width + soft, d);
}

/**
 * Apply an HSL adjust to an RGB pixel (0..1), gated by the hue-range mask. Global when rangeWidth >= 1.
 * Mirrors the WGSL case exactly. Pure.
 */
export function applyHslAdjust(r: number, g: number, b: number, opts: HslAdjust): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b);
  const mask = hslRangeMask(h, opts);
  if (mask <= 0) return [r, g, b];
  const h2 = fract(h + opts.hueShift);
  const s2 = clamp01(s * opts.satScale);
  const l2 = clamp01(l + opts.lightAdd);
  const [r2, g2, b2] = hslToRgb(h2, s2, l2);
  return [r + (r2 - r) * mask, g + (g2 - g) * mask, b + (b2 - b) * mask];
}
