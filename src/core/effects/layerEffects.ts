// B57: effects on text / shape layers through a precomp, plus a positionable bulge warp. The pure half:
//  - parseAgentEffects: the agent's effect list ({ effect: "digitalGlitch", params } or { type, params })
//    -> a LayerEffect stack (registry defaults filled, at most 7 params per slot like the shader);
//  - layerEffectsRoute: whether a layer takes the stack directly (image / adjustment / precomp) or is
//    nested in a precomp first (text, shape, video, lottie: the precomp texture is what the effect reads);
//  - bulgeWarpUV: CPU twin of the WGSL bulge case in engine/renderer.ts applyWarpEffect. Params
//    [amount, centreX, centreY, radius]: centre in texture UV (0..1), radius as a fraction of the texture
//    height. radius <= 0 (an old 1-param bulge) = the original centred bulge (centre 0.5, radius 0.5).
// Imports the registry only (no store / DOM) -> node-harnessable (`verify:layer-effects`).

import type { LayerEffect, Layer } from '../types';
import { getEffectDef, getEffectDefByType } from './effectRegistry';

/** Shader capacity: params per effect slot (renderer writeEffectSlots). */
export const EFFECT_SLOT_PARAMS = 7;

export interface AgentEffectSpec {
  /** Registry id, e.g. "digitalGlitch", "bulge", "rgbSplit". */
  effect?: string;
  /** Or the numeric effect type id. */
  type?: number;
  params?: number[];
  enabled?: boolean;
}

/** Turn the agent's effect list into a LayerEffect stack. Throws on an unknown effect or bad params. */
export function parseAgentEffects(raw: unknown): LayerEffect[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('"effects" must be a non-empty array of { effect: "<id>", params?: number[] }');
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`effects[${i}] must be an object`);
    const spec = item as AgentEffectSpec;
    const def = typeof spec.effect === 'string' ? getEffectDef(spec.effect) : typeof spec.type === 'number' ? getEffectDefByType(spec.type) : undefined;
    if (!def) throw new Error(`effects[${i}]: unknown effect ${JSON.stringify(spec.effect ?? spec.type)} (ids: src/core/effects/effectRegistry.ts EFFECT_DEFS, e.g. digitalGlitch, rgbSplit, bulge, twirl, wave)`);
    if (def.klass === 'legacy' || def.klass === 'wire') throw new Error(`effects[${i}]: "${def.id}" is not a per-layer stack effect`);
    const given = spec.params ?? [];
    if (!Array.isArray(given) || given.some((v) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error(`effects[${i}].params must be numbers`);
    const params = def.defaults.slice(0, EFFECT_SLOT_PARAMS);
    for (let p = 0; p < Math.min(given.length, EFFECT_SLOT_PARAMS); p++) params[p] = given[p];
    return { type: def.type, enabled: spec.enabled !== false, params };
  });
}

export type LayerEffectsRoute = 'direct' | 'wrap';

/** Image / adjustment / precomp layers carry the stack; text, shape, video and lottie are nested first. */
export function layerEffectsRoute(type: Layer['type']): LayerEffectsRoute | null {
  if (type === 'image' || type === 'adjustment' || type === 'precomp') return 'direct';
  if (type === 'text' || type === 'shape' || type === 'video' || type === 'lottieIcon') return 'wrap';
  return null;
}

/** Bulge params in texture space for a comp-px centre / radius on a precomp the size of the comp. */
export function bulgeParamsForComp(amount: number, centre: [number, number], radiusPx: number, compW: number, compH: number): number[] {
  return [amount, centre[0] / compW, centre[1] / compH, Math.max(1e-4, radiusPx / compH)];
}

/** CPU twin of the WGSL bulge warp: the texture UV sampled for output UV `uv`. */
export function bulgeWarpUV(uv: [number, number], aspect: number, params: readonly number[]): [number, number] {
  const p0 = params[0] ?? 0;
  const r0 = params[3] ?? 0;
  const cx = r0 > 0 ? (params[1] ?? 0.5) : 0.5;
  const cy = r0 > 0 ? (params[2] ?? 0.5) : 0.5;
  const maxr = r0 > 0 ? r0 : 0.5;
  const dx = (uv[0] - cx) * aspect;
  const dy = uv[1] - cy;
  const r = Math.hypot(dx, dy);
  if (!(r < maxr && r > 1e-5)) return [uv[0], uv[1]];
  const k = (Math.pow(r / maxr, 1 - p0) * maxr) / r;
  return [(dx * k) / aspect + cx, dy * k + cy];
}
