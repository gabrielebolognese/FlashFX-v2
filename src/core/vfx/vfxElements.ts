import type { PatternConfig, PatternStop } from '../../patterns/types';

// Practical VFX compositing elements (B30) - a curated catalog of light leaks, film burns, and
// atmosphere overlays, plus the pure sweep-keyframe generator. Each element is a full-frame
// generativePattern (warm palette, gradient/warp/clouds/plasma) set to a SCREEN or ADD blend - the one
// content-layer blend that actually composites on canvas today (the rest is the B11c-gpu gap). The
// pattern animates frame-purely by its own time input; buildVfxSweep adds an optional opacity envelope
// (fade in/out / film-burn flash) and a position drift as ordinary keyframes, so playback stays
// deterministic. This module is a pure leaf (imports only the pattern-config types); the layer
// creation + render are the editor/renderer's job. Unit-tested by scripts/verify-vfx.mjs.

export type VfxCategory = 'light-leak' | 'film-burn' | 'atmosphere';
export type VfxBlend = 'screen' | 'add';

/** Optional animation for an element: an opacity envelope (fractions of the clip) + an optional drift. */
export interface VfxSweep {
  fadeInFrac: number;   // 0..0.5 of the clip
  fadeOutFrac: number;  // 0..0.5 of the clip
  peakOpacity: number;  // 0..1 (the held opacity)
  driftFrom?: [number, number]; // normalized centre (fraction of comp), start
  driftTo?: [number, number];   // normalized centre (fraction of comp), end
}

export interface VfxElement {
  id: string;
  label: string;
  category: VfxCategory;
  blend: VfxBlend;
  fullFrame: boolean;      // size to the whole comp (overlays) vs 0.6x
  pattern: PatternConfig;  // the generative-pattern visual
  sweep?: VfxSweep;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const ramp = (colors: [number, number, number][]): PatternStop[] => colors.map((color, i) => ({ color, pos: i / (colors.length - 1) }));

// Leak palettes START AT BLACK on purpose: under a screen/add blend, black contributes nothing, so only
// the warm highlights wash over the footage (a real light-leak look).
const LEAK_PALETTES = {
  Amber: ramp([[0, 0, 0], [0.6, 0.25, 0.03], [1, 0.65, 0.2], [1, 0.95, 0.7]]),
  Golden: ramp([[0, 0, 0], [0.5, 0.35, 0.05], [1, 0.8, 0.3], [1, 1, 0.85]]),
  Crimson: ramp([[0, 0, 0], [0.4, 0.02, 0.06], [0.9, 0.15, 0.2], [1, 0.6, 0.4]]),
  Teal: ramp([[0, 0, 0], [0.02, 0.2, 0.25], [0.1, 0.6, 0.6], [0.7, 1, 0.9]]),
  Ember: ramp([[0, 0, 0], [0.3, 0.05, 0], [0.8, 0.25, 0.02], [1, 0.55, 0.15]]),
  Haze: ramp([[0, 0, 0], [0.15, 0.13, 0.12], [0.4, 0.37, 0.34], [0.7, 0.66, 0.6]]),
} as const;

function pattern(type: PatternConfig['type'], palette: PatternStop[], over: Partial<PatternConfig> = {}): PatternConfig {
  return {
    type, scale: 0.9, speed: 0.4, rotationDeg: 0, complexity: 4, warp: 0.3, contrast: 0.2,
    paletteMode: 'smooth', palette, ...over,
  };
}

export const VFX_ELEMENTS: VfxElement[] = [
  { id: 'warm-leak', label: 'Warm Leak', category: 'light-leak', blend: 'screen', fullFrame: true,
    pattern: pattern('warp', LEAK_PALETTES.Amber, { scale: 0.7, speed: 0.3, rotationDeg: 15, warp: 0.5 }),
    sweep: { fadeInFrac: 0.15, fadeOutFrac: 0.15, peakOpacity: 0.85 } },
  { id: 'golden-hour', label: 'Golden Hour', category: 'light-leak', blend: 'screen', fullFrame: true,
    pattern: pattern('gradient', LEAK_PALETTES.Golden, { scale: 0.9, speed: 0.4, rotationDeg: 25, warp: 0, contrast: 0 }),
    sweep: { fadeInFrac: 0.12, fadeOutFrac: 0.12, peakOpacity: 0.8 } },
  { id: 'crimson-leak', label: 'Crimson Leak', category: 'light-leak', blend: 'screen', fullFrame: true,
    pattern: pattern('warp', LEAK_PALETTES.Crimson, { scale: 0.8, speed: 0.35, rotationDeg: 200, warp: 0.6 }),
    sweep: { fadeInFrac: 0.15, fadeOutFrac: 0.15, peakOpacity: 0.8 } },
  { id: 'teal-leak', label: 'Teal Leak', category: 'light-leak', blend: 'screen', fullFrame: true,
    pattern: pattern('gradient', LEAK_PALETTES.Teal, { scale: 0.9, speed: 0.4, rotationDeg: 210, warp: 0, contrast: 0 }),
    sweep: { fadeInFrac: 0.12, fadeOutFrac: 0.12, peakOpacity: 0.75 } },
  { id: 'film-burn', label: 'Film Burn', category: 'film-burn', blend: 'add', fullFrame: true,
    pattern: pattern('warp', LEAK_PALETTES.Ember, { scale: 1.0, speed: 0.6, warp: 0.7, contrast: 0.4 }),
    sweep: { fadeInFrac: 0.1, fadeOutFrac: 0.4, peakOpacity: 1 } },
  { id: 'light-streak', label: 'Light Streak', category: 'film-burn', blend: 'add', fullFrame: true,
    pattern: pattern('gradient', LEAK_PALETTES.Golden, { scale: 1.2, speed: 0.5, rotationDeg: 45, warp: 0, contrast: 0.1 }),
    sweep: { fadeInFrac: 0.2, fadeOutFrac: 0.2, peakOpacity: 0.9, driftFrom: [-0.2, 0.3], driftTo: [1.2, 0.7] } },
  { id: 'atmo-haze', label: 'Atmosphere Haze', category: 'atmosphere', blend: 'screen', fullFrame: true,
    pattern: pattern('clouds', LEAK_PALETTES.Haze, { scale: 0.6, speed: 0.15, warp: 0.2, complexity: 5 }),
    sweep: { fadeInFrac: 0.2, fadeOutFrac: 0.2, peakOpacity: 0.5 } },
  { id: 'ember-glow', label: 'Ember Glow', category: 'atmosphere', blend: 'add', fullFrame: true,
    pattern: pattern('plasma', LEAK_PALETTES.Ember, { scale: 0.8, speed: 0.4, contrast: 0.3 }),
    sweep: { fadeInFrac: 0.15, fadeOutFrac: 0.15, peakOpacity: 0.6 } },
];

export function getVfxElement(id: string): VfxElement | undefined {
  return VFX_ELEMENTS.find((e) => e.id === id);
}

export interface VfxCtx { compWidth: number; compHeight: number }
export interface VfxKey { frame: number; value: number | [number, number] }
export interface VfxTracks {
  /** transform.opacity keyframes (empty when the element holds a constant opacity = peakOpacity). */
  opacity: VfxKey[];
  /** transform.position keyframes for a drift, or null. */
  position: VfxKey[] | null;
}

/**
 * Build the sweep keyframes for an element over a clip: an opacity envelope (fade in -> hold peak ->
 * fade out) and an optional position drift. Frames are absolute (startFrame..startFrame+durationFrames).
 * Pure + deterministic; the editor turns these into ordinary Keyframes so playback stays frame-pure.
 */
export function buildVfxSweep(sweep: VfxSweep, ctx: VfxCtx, startFrame: number, durationFrames: number): VfxTracks {
  const dur = Math.max(1, Math.round(durationFrames));
  const end = startFrame + dur;
  const peak = clamp01(sweep.peakOpacity);
  const fi = clamp(sweep.fadeInFrac, 0, 0.5), fo = clamp(sweep.fadeOutFrac, 0, 0.5);

  const opacity: VfxKey[] = [];
  if (fi > 0 || fo > 0) {
    const inFrame = fi > 0 ? Math.min(end - 1, Math.max(startFrame + 1, Math.round(startFrame + fi * dur))) : startFrame;
    const outFrame = fo > 0 ? Math.max(inFrame + 1, Math.min(end - 1, Math.round(end - fo * dur))) : end;
    if (fi > 0) opacity.push({ frame: startFrame, value: 0 });
    opacity.push({ frame: inFrame, value: peak });
    if (outFrame > inFrame) opacity.push({ frame: outFrame, value: peak });
    if (fo > 0) opacity.push({ frame: end, value: 0 });
  }

  let position: VfxKey[] | null = null;
  if (sweep.driftFrom && sweep.driftTo) {
    position = [
      { frame: startFrame, value: [sweep.driftFrom[0] * ctx.compWidth, sweep.driftFrom[1] * ctx.compHeight] },
      { frame: end, value: [sweep.driftTo[0] * ctx.compWidth, sweep.driftTo[1] * ctx.compHeight] },
    ];
  }
  return { opacity, position };
}
