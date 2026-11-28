// B46 - build a property's keyframe list from compact specs `[{ frame, value, ease }]`, with a
// DIFFERENT ease on every segment, in one pure call (the store wraps it in one undo step). This is how
// an agent writes a measured animation curve-for-curve: each reference move was fitted to a cubic-bezier
// (refs/rNN/timeline.json), and `ease` takes that quad directly.
//
// `ease` on key i shapes the segment i -> i+1 (After Effects / CSS convention):
//   - "linear" (default), "hold" (step: stays on this value until the next key), "spring"
//   - a named ease from core/easings (cubicOut, expoOut, backOut, elasticOut, bounceOut, ...)
//   - a CSS keyword: "ease", "ease-in", "ease-out", "ease-in-out"
//   - a cubic-bezier quad [x1, y1, x2, y2] (CSS cubic-bezier(); y may overshoot for pops)
// The last key's ease is ignored (no outgoing segment).
//
// Pure leaf (types + easings only) so `verify:keyframe-specs` bundles it standalone.

import type { Keyframe, Vec2 } from './types';
import { EASINGS, type EasingName } from './easings';
import { cloneValue, type KeyframeValue } from './keyframeValue';

export type CubicBezierQuad = [number, number, number, number];
export type KeyframeEaseSpec = 'linear' | 'hold' | 'spring' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | EasingName | CubicBezierQuad;

export interface KeyframeSpec {
  frame: number;
  value: KeyframeValue;
  ease?: KeyframeEaseSpec;
}

/** CSS keyword eases as their cubic-bezier quads (W3C css-easing-1). */
export const CSS_EASES: Readonly<Record<'ease' | 'ease-in' | 'ease-out' | 'ease-in-out', CubicBezierQuad>> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

// core/keyframeEase treats a handle of exactly [0, 0] as "unset" (legacy keyframes flipped to bezier
// without a drag) and substitutes a default. A real cubic-bezier can legitimately START with (0, 0)
// (CSS ease-out is 0, 0, 0.58, 1), so such a handle is stored nudged by 1e-6 in x: the curve differs
// from the exact one by < 1e-6 of the segment, far below one frame or one 8-bit level.
const HANDLE_EPS = 1e-6;
const storeHandle = (x: number, y: number): Vec2 => (x === 0 && y === 0 ? [HANDLE_EPS, 0] : [x, y]);

/** Every named ease (core/easings). */
export const EASING_NAMES: readonly string[] = Object.keys(EASINGS);
const NAMED = new Set<string>(EASING_NAMES);

export type ValueShape = 'number' | 'vec2' | 'color';

function shapeOf(v: unknown): ValueShape | null {
  if (typeof v === 'number') return Number.isFinite(v) ? 'number' : null;
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  if (v.length === 2) return 'vec2';
  if (v.length === 4) return 'color';
  return null;
}

// B67 - the reference breakdowns (refs/rNN/timeline.json, replicas notes) and most agents write eases
// with the easings.net / After Effects names ('easeOutCubic', 'easeInOut', 'Easy Ease'). They resolve
// to the canonical names here, so `setKeyframes` / `setShapeMorph` / cursor and camera moves accept
// them without a failed round trip. Matching ignores case, spaces, '-' and '_'.
const EASE_FAMILIES = ['sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'elastic', 'bounce'] as const;
const DIR_SUFFIX: Record<string, string> = { in: 'In', out: 'Out', inout: 'InOut' };
/** After Effects' default Easy Ease (33.33% influence, zero speed at both keys). */
export const EASY_EASE: CubicBezierQuad = [1 / 3, 0, 2 / 3, 1];

/** Map an alias ease name onto the canonical spec; anything else is returned unchanged. */
export function canonicalEase<T>(ease: T): T | KeyframeEaseSpec {
  if (typeof ease !== 'string') return ease;
  if (ease === 'linear' || ease === 'hold' || ease === 'spring' || ease in CSS_EASES || NAMED.has(ease)) return ease;
  const k = ease.toLowerCase().replace(/[\s_-]+/g, '');
  if (k === 'linear' || k === 'hold' || k === 'spring') return k;
  if (k === 'ease') return 'ease';
  if (k === 'easein') return 'ease-in';
  if (k === 'easeout') return 'ease-out';
  if (k === 'easeinout') return 'ease-in-out';
  if (k === 'easyease') return EASY_EASE;
  if (k === 'easyeasein') return [1 / 3, 0, 1, 1];
  if (k === 'easyeaseout') return [0, 0, 2 / 3, 1];
  for (const fam of EASE_FAMILIES) {
    for (const dir of ['inout', 'in', 'out']) {
      if (k === `ease${dir}${fam}` || k === `${fam}${dir}` || k === `${fam}ease${dir}`) {
        const name = `${fam}${DIR_SUFFIX[dir]}`;
        if (NAMED.has(name)) return name as EasingName;
      }
    }
  }
  return ease;
}

/** Validate one ease spec; returns an error message or null. Alias names (see `canonicalEase`) are valid. */
export function easeSpecError(rawEase: unknown): string | null {
  const ease = canonicalEase(rawEase);
  if (ease === undefined || ease === null) return null;
  if (typeof ease === 'string') {
    if (ease === 'linear' || ease === 'hold' || ease === 'spring' || ease in CSS_EASES || NAMED.has(ease)) return null;
    return `unknown ease "${ease}"; use linear, hold, spring, ease, ease-in, ease-out, ease-in-out (or easeIn / easeOut / easeInOut), easyEase, a named ease (${EASING_NAMES.slice(0, 6).join(', ')}, ...; easings.net names like easeOutCubic also work) or [x1, y1, x2, y2]`;
  }
  if (Array.isArray(ease) && ease.length === 4 && ease.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    if (ease[0] < 0 || ease[0] > 1 || ease[2] < 0 || ease[2] > 1) return 'cubic-bezier x1 and x2 must be within 0..1';
    return null;
  }
  return 'ease must be a string or a cubic-bezier [x1, y1, x2, y2]';
}

/**
 * Build the keyframe list. `expected` (when given) is the property's value shape: every value must
 * match it. `existing` + `merge` keeps the property's other keyframes (spec frames replace any key at
 * the same frame); without merge the specs ARE the new list. Throws on invalid input (nothing applied).
 */
export function buildKeyframesFromSpecs(
  specs: readonly KeyframeSpec[],
  opts: { expected?: ValueShape; existing?: readonly Keyframe[]; merge?: boolean } = {},
): Keyframe[] {
  if (!Array.isArray(specs) || specs.length === 0) throw new Error('keyframes must be a non-empty array of { frame, value, ease? }');
  const byFrame = new Map<number, KeyframeSpec>();
  specs.forEach((sp, i) => {
    if (!sp || typeof sp !== 'object') throw new Error(`keyframes[${i}] must be an object { frame, value, ease? }`);
    if (typeof sp.frame !== 'number' || !Number.isFinite(sp.frame)) throw new Error(`keyframes[${i}].frame must be a number`);
    const shape = shapeOf(sp.value);
    if (!shape) throw new Error(`keyframes[${i}].value must be a number, [x, y] or an RGBA colour [r, g, b, a] (0..1)`);
    if (opts.expected && shape !== opts.expected) throw new Error(`keyframes[${i}].value is a ${shape} but this property takes a ${opts.expected}`);
    const err = easeSpecError(sp.ease);
    if (err) throw new Error(`keyframes[${i}].ease: ${err}`);
    byFrame.set(Math.round(sp.frame), sp); // a later spec at the same frame wins
  });

  const fresh: Keyframe[] = [...byFrame.entries()].map(([frame, sp]) => ({
    frame,
    value: cloneValue(sp.value),
    interpolation: 'linear',
    handleIn: [0, 0],
    handleOut: [0, 0],
  }));
  const kept: Keyframe[] = opts.merge && opts.existing ? opts.existing.filter((k) => !byFrame.has(k.frame)).map((k) => ({ ...k })) : [];
  const all = [...kept, ...fresh].sort((a, b) => a.frame - b.frame);

  // Apply each spec's ease to its outgoing segment (and the incoming handle of the next key).
  for (let i = 0; i < all.length; i++) {
    const sp = byFrame.get(all[i].frame);
    if (!sp || !fresh.includes(all[i])) continue;
    const k = all[i];
    const next = all[i + 1];
    let ease = canonicalEase(sp.ease ?? 'linear');
    if (typeof ease === 'string' && ease in CSS_EASES) ease = CSS_EASES[ease as keyof typeof CSS_EASES];
    delete k.easing;
    if (Array.isArray(ease)) {
      k.interpolation = 'bezier';
      k.handleOut = storeHandle(ease[0], ease[1]);
      if (next) next.handleIn = storeHandle(ease[2], ease[3]);
    } else if (ease === 'hold' || ease === 'spring' || ease === 'linear') {
      k.interpolation = ease;
    } else {
      k.interpolation = 'bezier';
      k.easing = ease as EasingName;
    }
  }
  return all;
}
