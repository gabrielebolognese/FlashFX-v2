import type { BlendMode } from '../types';

// Blend modes (B11c) - the authoritative reference implementation of every separable W3C blend mode
// (Compositing and Blending Level 1) plus linear-dodge "add". This pure module is BOTH the spec the
// renderer's WGSL mirrors AND the routing table it consults (which modes are hardware-blendable via a
// GPU blend-state pipeline variant vs. which need to read the destination in-shader). Pure leaf, no
// runtime imports; fully unit-tested (verify:blend-modes). The content-layer GPU wiring is B11c-gpu.

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Blend one channel: `cb` = backdrop (below), `cs` = source (this layer), both non-premultiplied in
 * [0,1]. Returns the blended channel value (the "B(cb,cs)" of the W3C spec), clamped to [0,1].
 */
export function blendChannel(cb: number, cs: number, mode: BlendMode): number {
  const b = clamp01(cb); const s = clamp01(cs);
  switch (mode) {
    case 'normal': return s;
    case 'darken': return Math.min(b, s);
    case 'multiply': return b * s;
    case 'colorBurn': return s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case 'lighten': return Math.max(b, s);
    case 'screen': return b + s - b * s;
    case 'colorDodge': return s >= 1 ? 1 : Math.min(1, b / (1 - s));
    case 'add': return clamp01(b + s);
    case 'overlay': return hardLight(s, b); // overlay(cb,cs) = hardLight(cs,cb)
    case 'hardLight': return hardLight(b, s);
    case 'softLight': return softLight(b, s);
    case 'difference': return Math.abs(b - s);
    case 'exclusion': return b + s - 2 * b * s;
    default: return s;
  }
}

function hardLight(cb: number, cs: number): number {
  return cs <= 0.5 ? 2 * cb * cs : 1 - 2 * (1 - cb) * (1 - cs);
}

function softLight(cb: number, cs: number): number {
  if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
  const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
  return cb + (2 * cs - 1) * (d - cb);
}

/** Blend an RGB triple (arrays of 3 channels in [0,1]). */
export function blendRGB(backdrop: readonly [number, number, number], source: readonly [number, number, number], mode: BlendMode): [number, number, number] {
  return [
    blendChannel(backdrop[0], source[0], mode),
    blendChannel(backdrop[1], source[1], mode),
    blendChannel(backdrop[2], source[2], mode),
  ];
}

export interface BlendModeMeta {
  label: string;
  /**
   * True when the mode maps to a fixed GPU blend-state pipeline variant (no destination read needed):
   * the renderer can draw it directly like the generative-pattern blend path. False modes are
   * destination-dependent and need an in-shader scene composite (the heavier B11c-gpu path).
   */
  hardware: boolean;
}

// Ordered for the UI dropdown, grouped W3C-style (normal / darken / lighten / contrast / inversion).
export const BLEND_MODES: BlendMode[] = [
  'normal',
  'darken', 'multiply', 'colorBurn',
  'lighten', 'screen', 'colorDodge', 'add',
  'overlay', 'softLight', 'hardLight',
  'difference', 'exclusion',
];

export const BLEND_MODE_META: Record<BlendMode, BlendModeMeta> = {
  normal: { label: 'Normal', hardware: true },
  darken: { label: 'Darken', hardware: true },
  multiply: { label: 'Multiply', hardware: true },
  colorBurn: { label: 'Color Burn', hardware: false },
  lighten: { label: 'Lighten', hardware: true },
  screen: { label: 'Screen', hardware: true },
  colorDodge: { label: 'Color Dodge', hardware: false },
  add: { label: 'Add', hardware: true },
  overlay: { label: 'Overlay', hardware: false },
  softLight: { label: 'Soft Light', hardware: false },
  hardLight: { label: 'Hard Light', hardware: false },
  difference: { label: 'Difference', hardware: false },
  exclusion: { label: 'Exclusion', hardware: false },
};

/** Whether a mode can be rendered by a fixed GPU blend-state variant (no destination read). */
export function isHardwareBlend(mode: BlendMode): boolean {
  return BLEND_MODE_META[mode]?.hardware ?? false;
}
