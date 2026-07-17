// "Wire" filters: catalog blur/glow entries that route to the layer's existing
// LayerBlur / LayerGlow properties (and thus the renderer's real multi-pass RTT
// passes) rather than to the effect-stack WGSL switch. No new shader code — this
// is pure data + builders so the React panel stays free of blur/glow knowledge.
//
// Many catalog ids collapse onto the single layer.blur / layer.glow slot (a layer
// has one blur and one glow), so each authored property records `variant` = the
// filter id, letting the panel read the right slider back and keeping the sliders
// mutually exclusive (dragging a second blur switches the blur type).

import type { LayerBlur, LayerGlow, BlurType, GlowMode, Vec4 } from '../types';

type WireTarget = 'blur' | 'glow';

interface BlurWire {
  target: 'blur';
  type: BlurType;
}
interface GlowWire {
  target: 'glow';
  mode: GlowMode;
  radius: number;
  threshold: number;
  intensityScale: number; // slider (0..1) → LayerGlow.intensity
  color: Vec4;
}
type WireSpec = BlurWire | GlowWire;

const WIRE: Record<string, WireSpec> = {
  // ── Blur → LayerBlur (radius = slider value in px) ──
  gaussianBlur:    { target: 'blur', type: 'gaussian' },
  boxBlur:         { target: 'blur', type: 'gaussian' },
  surfaceBlur:     { target: 'blur', type: 'gaussian' },
  smartBlur:       { target: 'blur', type: 'gaussian' },
  bilateralBlur:   { target: 'blur', type: 'gaussian' },
  kawaseBlur:      { target: 'blur', type: 'kawase' },
  lensBlur:        { target: 'blur', type: 'kawase' },
  bokehBlur:       { target: 'blur', type: 'kawase' },
  directionalBlur: { target: 'blur', type: 'directional' },
  motionBlur:      { target: 'blur', type: 'directional' },
  radialBlur:      { target: 'blur', type: 'radial' },
  zoomBlur:        { target: 'blur', type: 'radial' },
  // ── Glow → LayerGlow (intensity = slider × intensityScale) ──
  glow:      { target: 'glow', mode: 'image', radius: 15, threshold: 0.5,  intensityScale: 2.0, color: [1, 1, 1, 1] },
  bloom:     { target: 'glow', mode: 'image', radius: 22, threshold: 0.7,  intensityScale: 2.5, color: [1, 1, 1, 1] },
  softGlow:  { target: 'glow', mode: 'image', radius: 32, threshold: 0.3,  intensityScale: 1.5, color: [1, 1, 1, 1] },
  neonGlow:  { target: 'glow', mode: 'image', radius: 12, threshold: 0.55, intensityScale: 3.0, color: [0.4, 0.9, 1, 1] },
  innerGlow: { target: 'glow', mode: 'inner', radius: 12, threshold: 0.5,  intensityScale: 2.0, color: [1, 1, 1, 1] },
  outerGlow: { target: 'glow', mode: 'outer', radius: 18, threshold: 0.5,  intensityScale: 2.0, color: [1, 1, 1, 1] },
};

export function isWireFilter(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(WIRE, id);
}

export function wireTarget(id: string): WireTarget | null {
  return WIRE[id]?.target ?? null;
}

function buildWireBlur(id: string, value: number): LayerBlur {
  const spec = WIRE[id] as BlurWire;
  const passes = spec.type === 'kawase' ? Math.min(8, Math.max(1, Math.round(value / 2))) : 1;
  return {
    enabled: value > 0,
    type: spec.type,
    radius: value,
    angle: 0,
    centerX: 0.5,
    centerY: 0.5,
    strength: 1,
    passes,
    variant: id,
  };
}

function buildWireGlow(id: string, value: number): LayerGlow {
  const spec = WIRE[id] as GlowWire;
  return {
    enabled: value > 0,
    mode: spec.mode,
    onlyGlow: false,
    color: spec.color,
    intensity: value * spec.intensityScale,
    radius: spec.radius,
    threshold: spec.threshold,
    variant: id,
  };
}

/** The layer property (path + value) a wire filter should write. value 0 → disabled. */
export function buildWire(
  id: string,
  value: number,
): { path: 'blur' | 'glow'; value: LayerBlur | LayerGlow } | null {
  const spec = WIRE[id];
  if (!spec) return null;
  if (spec.target === 'blur') return { path: 'blur', value: buildWireBlur(id, value) };
  return { path: 'glow', value: buildWireGlow(id, value) };
}

/** Read a wire filter's slider back — only if it is the active variant on the layer. */
export function readWireValue(id: string, layer: { blur?: LayerBlur; glow?: LayerGlow }): number {
  const spec = WIRE[id];
  if (!spec) return 0;
  if (spec.target === 'blur') {
    return layer.blur?.variant === id && layer.blur.enabled ? layer.blur.radius : 0;
  }
  const g = layer.glow;
  if (g?.variant === id && g.enabled) {
    return g.intensity / (spec.intensityScale || 1);
  }
  return 0;
}
