import type { GlowMode, LayerGlow, Vec4 } from '../types';
import { DEFAULT_GLOW } from '../effectDefaults';

// Glow & light finishing (B12) - pure param model: glow-mode metadata (which modes need the
// browser-gated downsample pyramid), light-finish presets (built on the existing glow pipeline so
// they render NOW), resolution-relative helpers, and param clamping. Pure - unit-tested
// (verify:glow-params). The bloom pyramid / light-wrap / glint PASSES are browser-gated (B12-gpu).

export interface GlowModeMeta { label: string; needsPyramid: boolean }

export const GLOW_MODE_META: Record<GlowMode, GlowModeMeta> = {
  image: { label: 'Image', needsPyramid: false },
  outer: { label: 'Outer', needsPyramid: false },
  inner: { label: 'Inner', needsPyramid: false },
  bloom: { label: 'Bloom', needsPyramid: true },
};

export const GLOW_MODES: GlowMode[] = ['image', 'outer', 'inner', 'bloom'];

/** Whether a mode wants the multi-scale downsample pyramid (B12-gpu); false modes render today. */
export function glowNeedsPyramid(mode: GlowMode): boolean {
  return GLOW_MODE_META[mode]?.needsPyramid ?? false;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Clamp a glow's params into valid ranges (threshold 0..1, non-negative radius/intensity, etc.). */
export function clampGlow(g: LayerGlow): LayerGlow {
  return {
    ...g,
    intensity: Math.max(0, g.intensity),
    radius: Math.max(0, g.radius),
    threshold: clamp(g.threshold, 0, 1),
    ...(g.lightWrap !== undefined ? { lightWrap: clamp(g.lightWrap, 0, 1) } : {}),
    ...(g.glints !== undefined ? { glints: Math.max(0, Math.round(g.glints)) } : {}),
    ...(g.glintLength !== undefined ? { glintLength: clamp(g.glintLength, 0, 100) } : {}),
  };
}

export interface GlowPreset { name: string; label: string; glow: Partial<LayerGlow> }

// Presets tuned on params the existing glow pipeline already renders (mode/color/intensity/radius/
// threshold), so applying one is immediately visible. 'bloom' mode renders as a broad image glow
// today and gets the real pyramid in B12-gpu.
export const GLOW_PRESETS: GlowPreset[] = [
  { name: 'soft', label: 'Soft Glow', glow: { mode: 'image', color: [1, 1, 1, 1] as Vec4, intensity: 0.8, radius: 20, threshold: 0.5 } },
  { name: 'bloom', label: 'Bloom', glow: { mode: 'bloom', color: [1, 1, 1, 1] as Vec4, intensity: 1.4, radius: 42, threshold: 0.55 } },
  { name: 'deep', label: 'Deep Glow', glow: { mode: 'bloom', color: [1, 0.96, 0.88, 1] as Vec4, intensity: 1.1, radius: 80, threshold: 0.35 } },
  { name: 'neon', label: 'Neon', glow: { mode: 'outer', color: [0.2, 1, 1, 1] as Vec4, intensity: 1.8, radius: 16, threshold: 0.2 } },
];

/** Merge a preset over a base glow (default = DEFAULT_GLOW), enable it, and clamp. */
export function applyGlowPreset(preset: GlowPreset, base: LayerGlow = DEFAULT_GLOW): LayerGlow {
  return clampGlow({ ...base, ...preset.glow, enabled: true });
}

const minSide = (w: number, h: number) => Math.max(1, Math.min(w, h));

/**
 * Resolution-relative glow radius in px: `radius` is authored against a 1080p short side, so a glow
 * looks the same on a 720p and a 4K comp. (Used by the renderer path when it opts in; the legacy
 * absolute-radius path is unchanged.)
 */
export function glowRadiusPx(radius: number, w: number, h: number): number {
  return Math.max(0, (Math.max(0, radius) / 1080) * minSide(w, h));
}
