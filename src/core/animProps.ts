// B33 / B47 / B50 - animated overrides of static layer fields (colour keyframes, keyframable glow /
// shadow / layer-blur params and effect-stack params).
//
// Pure leaf module: imports only types + core/keyframeEase (which imports only core/easings), so the
// harness (`verify:anim-props`) bundles it standalone and the resolver stays frame-pure.
//
// Model: `layer.animProps.<key>` is an AnimatableProperty (numbers) or an AnimatableColor (RGBA). Once
// it has keyframes it REPLACES the static field at resolve time; with no keyframes (or absent, as in
// every legacy project) the static field is used unchanged, byte-identical. Agents and the UI address
// these through friendly paths ("shape.fillColor", "glow.intensity", "effect.<type>.<param>"), which
// `canonicalKeyframePath` maps onto "animProps.<key>" so every generic keyframe op (addKeyframe,
// setKeyframes, easing, interpolation, delete) works on them.

import type { AnimatableColor, AnimatableProperty, Keyframe, LayerAnimProps, Vec4 } from './types';
import { segmentProgress } from './keyframeEase';
import { uid } from './factory';

export type AnimPropKey = Exclude<keyof LayerAnimProps, 'effectParams'>;
export type AnimPropKind = 'number' | 'color';

interface AnimPropDef {
  key: AnimPropKey;
  kind: AnimPropKind;
  /** Display name (timeline / inspector). */
  name: string;
  /** Friendly paths that resolve to this key (the first is the canonical "static" field). */
  aliases: readonly string[];
  /** Layer types whose resolver reads this override (others ignore it). */
  layerTypes: readonly string[];
}

const FX_LAYERS = ['shape', 'text', 'image', 'video', 'adjustment', 'particle', 'animationItem', 'generativePattern', 'lottieIcon', 'fieldSampled', 'precomp'] as const;

export const ANIM_PROP_DEFS: readonly AnimPropDef[] = [
  { key: 'fillColor', kind: 'color', name: 'Fill Color', aliases: ['shape.fillColor', 'fillColor'], layerTypes: ['shape'] },
  { key: 'strokeColor', kind: 'color', name: 'Stroke Color', aliases: ['shape.strokeColor', 'strokeColor'], layerTypes: ['shape'] },
  { key: 'textColor', kind: 'color', name: 'Text Color', aliases: ['content.spans.0.style.color', 'text.color', 'textColor'], layerTypes: ['text'] },
  { key: 'textStrokeColor', kind: 'color', name: 'Text Stroke Color', aliases: ['content.spans.0.style.strokeColor', 'text.strokeColor', 'textStrokeColor'], layerTypes: ['text'] },
  { key: 'glowColor', kind: 'color', name: 'Glow Color', aliases: ['glow.color', 'glowColor'], layerTypes: FX_LAYERS },
  { key: 'shadowColor', kind: 'color', name: 'Shadow Color', aliases: ['shadow.color', 'shadowColor'], layerTypes: FX_LAYERS },
  { key: 'glowIntensity', kind: 'number', name: 'Glow Intensity', aliases: ['glow.intensity', 'glowIntensity'], layerTypes: FX_LAYERS },
  { key: 'glowRadius', kind: 'number', name: 'Glow Radius', aliases: ['glow.radius', 'glowRadius'], layerTypes: FX_LAYERS },
  { key: 'glowThreshold', kind: 'number', name: 'Glow Threshold', aliases: ['glow.threshold', 'glowThreshold'], layerTypes: FX_LAYERS },
  { key: 'shadowBlur', kind: 'number', name: 'Shadow Blur', aliases: ['shadow.blurRadius', 'shadowBlur'], layerTypes: FX_LAYERS },
  { key: 'shadowDistance', kind: 'number', name: 'Shadow Distance', aliases: ['shadow.lightDistance', 'shadowDistance'], layerTypes: FX_LAYERS },
  { key: 'shadowAngle', kind: 'number', name: 'Shadow Angle', aliases: ['shadow.lightAngle', 'shadowAngle'], layerTypes: FX_LAYERS },
  { key: 'shadowScale', kind: 'number', name: 'Shadow Scale', aliases: ['shadow.shadowScale', 'shadowScale'], layerTypes: FX_LAYERS },
  { key: 'blurRadius', kind: 'number', name: 'Blur Radius', aliases: ['blur.radius', 'blurRadius'], layerTypes: FX_LAYERS },
  { key: 'blurStrength', kind: 'number', name: 'Blur Strength', aliases: ['blur.strength', 'blurStrength'], layerTypes: FX_LAYERS },
  { key: 'blurAngle', kind: 'number', name: 'Blur Angle', aliases: ['blur.angle', 'blurAngle'], layerTypes: FX_LAYERS },
];

const DEF_BY_KEY = new Map<string, AnimPropDef>(ANIM_PROP_DEFS.map((d) => [d.key, d]));
const DEF_BY_ALIAS = new Map<string, AnimPropDef>();
for (const d of ANIM_PROP_DEFS) for (const a of d.aliases) DEF_BY_ALIAS.set(a, d);

const EFFECT_ALIAS = /^effects?\.(\d+)\.(?:params\.)?(\d+)$/;
const EFFECT_CANON = /^animProps\.effectParams\.(\d+)_(\d+)$/;

/** Every friendly path an agent may keyframe through this module (for docs / the manifest). */
export const ANIM_PROP_PATHS: readonly string[] = [...ANIM_PROP_DEFS.map((d) => d.aliases[0]), 'effect.<type>.<paramIndex>'];

/**
 * Map a friendly property path onto its animated-override path, or return it unchanged when it is not
 * one ("transform.position" stays "transform.position"). Idempotent.
 *   "shape.fillColor"   -> "animProps.fillColor"
 *   "glow.intensity"    -> "animProps.glowIntensity"
 *   "effect.170.0"      -> "animProps.effectParams.170_0"   (effect type id 170, param 0)
 */
export function canonicalKeyframePath(path: string): string {
  const def = DEF_BY_ALIAS.get(path);
  if (def) return `animProps.${def.key}`;
  const m = EFFECT_ALIAS.exec(path);
  if (m) return `animProps.effectParams.${Number(m[1])}_${Number(m[2])}`;
  return path;
}

export interface AnimPropTarget {
  kind: AnimPropKind;
  name: string;
  /** Set for a named key; for an effect param, type + paramIndex are set instead. */
  key?: AnimPropKey;
  effectType?: number;
  paramIndex?: number;
}

/** Describe a canonical "animProps.*" path (null when the path is not an animated override). */
export function animPropTarget(canonicalPath: string): AnimPropTarget | null {
  if (canonicalPath.startsWith('animProps.effectParams.')) {
    const m = EFFECT_CANON.exec(canonicalPath);
    if (!m) return null;
    const effectType = Number(m[1]);
    const paramIndex = Number(m[2]);
    return { kind: 'number', name: `Effect ${effectType} param ${paramIndex}`, effectType, paramIndex };
  }
  if (!canonicalPath.startsWith('animProps.')) return null;
  const def = DEF_BY_KEY.get(canonicalPath.slice('animProps.'.length));
  return def ? { kind: def.kind, name: def.name, key: def.key } : null;
}

/** The static value the override replaces (read straight off the layer object), for seeding defaults. */
export function staticValueFor(layer: unknown, target: AnimPropTarget): number | Vec4 | undefined {
  const l = layer as Record<string, unknown> & { type?: string };
  const get = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), l);
  if (target.effectType !== undefined && target.paramIndex !== undefined) {
    const effects = l.effects as { type: number; params: number[] }[] | undefined;
    const e = effects?.find((x) => x.type === target.effectType);
    const v = e?.params[target.paramIndex];
    return typeof v === 'number' ? v : undefined;
  }
  const def = target.key ? DEF_BY_KEY.get(target.key) : undefined;
  if (!def) return undefined;
  for (const a of def.aliases) {
    const v = get(a);
    if (typeof v === 'number') return v;
    if (Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === 'number')) return [v[0], v[1], v[2], v[3]];
  }
  return undefined;
}

/** Create an empty override track for a target, seeded with the field's current static value. */
export function createAnimProp(target: AnimPropTarget, staticValue: number | Vec4 | undefined): AnimatableProperty | AnimatableColor {
  if (target.kind === 'color') {
    const def: Vec4 = Array.isArray(staticValue) ? [staticValue[0], staticValue[1], staticValue[2], staticValue[3]] : [1, 1, 1, 1];
    return { id: uid(), name: target.name, valueType: 'color', defaultValue: def, keyframes: [] };
  }
  return { id: uid(), name: target.name, valueType: 'number', defaultValue: typeof staticValue === 'number' ? staticValue : 0, keyframes: [] };
}

// ---------------------------------------------------------------------------------------------
// Evaluation (frame-pure)
// ---------------------------------------------------------------------------------------------

/** sRGB transfer (IEC 61966-2-1) - decode an 8-bit-style 0..1 channel to linear light. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
/** Encode linear light back to sRGB 0..1. */
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Mix two straight-alpha RGBA colours at progress p: RGB in LINEAR light (no muddy dark midpoints),
 *  alpha linearly. p may overshoot (back / elastic eases); the result is clamped to 0..1. */
export function mixColorLinear(a: Vec4, b: Vec4, p: number): Vec4 {
  const out: Vec4 = [0, 0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const la = srgbToLinear(clamp01(a[i]));
    const lb = srgbToLinear(clamp01(b[i]));
    out[i] = clamp01(linearToSrgb(Math.max(0, la + (lb - la) * p)));
  }
  out[3] = clamp01(a[3] + (b[3] - a[3]) * p);
  return out;
}

function segmentIndex(kfs: readonly Keyframe[], frame: number): number {
  // Largest i with kfs[i].frame <= frame (caller guarantees kfs[0].frame < frame < last.frame).
  let lo = 0, hi = kfs.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (kfs[mid].frame <= frame) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function asColor(v: Keyframe['value'], fallback: Vec4): Vec4 {
  return Array.isArray(v) && v.length === 4 ? v : fallback;
}

/** Evaluate a scalar override; the static value when there are no keyframes. Matches the scalar branch
 *  of interpolation.evaluateProperty exactly (same segment search + core/keyframeEase progress). */
export function evalAnimNumber(prop: AnimatableProperty | undefined, staticValue: number, frame: number): number {
  const kfs = prop?.keyframes;
  if (!kfs || kfs.length === 0) return staticValue;
  const num = (v: Keyframe['value']) => (typeof v === 'number' ? v : v[0]);
  if (kfs.length === 1) return frame < kfs[0].frame ? staticValue : num(kfs[0].value);
  if (frame <= kfs[0].frame) return num(kfs[0].value);
  const last = kfs[kfs.length - 1];
  if (frame >= last.frame) return num(last.value);
  const i = segmentIndex(kfs, frame);
  const a = kfs[i], b = kfs[i + 1];
  const dur = b.frame - a.frame;
  const t = dur === 0 ? 0 : clamp01((frame - a.frame) / dur);
  const from = num(a.value), to = num(b.value);
  return from + (to - from) * segmentProgress(t, a, b);
}

/** Evaluate a colour override (linear-light mix, every ease incl. hold); the static colour when unkeyed. */
export function evalAnimColor(prop: AnimatableColor | undefined, staticValue: Vec4, frame: number): Vec4 {
  const kfs = prop?.keyframes;
  if (!kfs || kfs.length === 0) return staticValue;
  if (kfs.length === 1) return frame < kfs[0].frame ? staticValue : asColor(kfs[0].value, staticValue);
  if (frame <= kfs[0].frame) return asColor(kfs[0].value, staticValue);
  const last = kfs[kfs.length - 1];
  if (frame >= last.frame) return asColor(last.value, staticValue);
  const i = segmentIndex(kfs, frame);
  const a = kfs[i], b = kfs[i + 1];
  const dur = b.frame - a.frame;
  const t = dur === 0 ? 0 : clamp01((frame - a.frame) / dur);
  const p = segmentProgress(t, a, b);
  const ca = asColor(a.value, staticValue), cb = asColor(b.value, staticValue);
  if (p === 0) return ca; // hold segments (and t = 0) return the exact authored colour
  return mixColorLinear(ca, cb, p);
}

/** Does this layer carry any keyed override? (The resolver's fast path skips all work when false.) */
export function hasAnimProps(anim: LayerAnimProps | undefined): boolean {
  if (!anim) return false;
  for (const d of ANIM_PROP_DEFS) if ((anim[d.key]?.keyframes.length ?? 0) > 0) return true;
  if (anim.effectParams) for (const k in anim.effectParams) if (anim.effectParams[k].keyframes.length > 0) return true;
  return false;
}

/** Effect-stack param at a frame: the keyed override for (type, paramIndex) or the static param. */
export function evalEffectParam(anim: LayerAnimProps | undefined, effectType: number, paramIndex: number, staticValue: number, frame: number): number {
  const prop = anim?.effectParams?.[`${effectType}_${paramIndex}`];
  return prop ? evalAnimNumber(prop, staticValue, frame) : staticValue;
}

// ---------------------------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------------------------

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function sanitizeKeyframes(raw: unknown, kind: AnimPropKind): Keyframe[] {
  if (!Array.isArray(raw)) return [];
  const out: Keyframe[] = [];
  for (const k of raw) {
    if (!k || typeof k !== 'object') continue;
    const r = k as Record<string, unknown>;
    if (!isNum(r.frame)) continue;
    const v = r.value;
    const okValue = kind === 'color'
      ? Array.isArray(v) && v.length === 4 && v.every(isNum)
      : isNum(v);
    if (!okValue) continue;
    const vec2 = (h: unknown): [number, number] => (Array.isArray(h) && h.length === 2 && h.every(isNum) ? [h[0], h[1]] : [0, 0]);
    const interp = r.interpolation === 'bezier' || r.interpolation === 'hold' || r.interpolation === 'spring' ? r.interpolation : 'linear';
    const kf: Keyframe = {
      frame: r.frame,
      value: kind === 'color' ? [(v as number[])[0], (v as number[])[1], (v as number[])[2], (v as number[])[3]] : (v as number),
      interpolation: interp,
      handleIn: vec2(r.handleIn),
      handleOut: vec2(r.handleOut),
    };
    if (typeof r.easing === 'string') kf.easing = r.easing as Keyframe['easing'];
    out.push(kf);
  }
  return out.sort((a, b) => a.frame - b.frame);
}

function sanitizeProp(raw: unknown, kind: AnimPropKind, name: string): AnimatableProperty | AnimatableColor | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const keyframes = sanitizeKeyframes(r.keyframes, kind);
  const id = typeof r.id === 'string' ? r.id : uid();
  const nm = typeof r.name === 'string' ? r.name : name;
  if (kind === 'color') {
    const d = r.defaultValue;
    const def: Vec4 = Array.isArray(d) && d.length === 4 && d.every(isNum) ? [d[0], d[1], d[2], d[3]] : [1, 1, 1, 1];
    return { id, name: nm, valueType: 'color', defaultValue: def, keyframes };
  }
  return { id, name: nm, valueType: 'number', defaultValue: isNum(r.defaultValue) ? r.defaultValue : 0, keyframes };
}

/**
 * Rebuild a saved `animProps` blob with guaranteed-valid tracks (unknown keys and malformed keyframes
 * dropped), so a corrupt save can never crash resolve. Absent / empty -> undefined (no field written).
 */
export function sanitizeAnimProps(raw: unknown): LayerAnimProps | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: LayerAnimProps = {};
  let any = false;
  for (const d of ANIM_PROP_DEFS) {
    const p = sanitizeProp(r[d.key], d.kind, d.name);
    if (!p) continue;
    // The def's kind decides the track type, so the key always receives the matching shape.
    (out as Record<string, unknown>)[d.key] = p;
    any = true;
  }
  if (r.effectParams && typeof r.effectParams === 'object') {
    const fx: Record<string, AnimatableProperty> = {};
    for (const [k, v] of Object.entries(r.effectParams as Record<string, unknown>)) {
      if (!/^\d+_\d+$/.test(k)) continue;
      const p = sanitizeProp(v, 'number', `Effect ${k}`);
      if (p && p.valueType === 'number') { fx[k] = p; any = true; }
    }
    if (Object.keys(fx).length) out.effectParams = fx;
  }
  return any ? out : undefined;
}
