import type { Vec2, Vec4 } from './types';

// Component-wise helpers over a keyframe VALUE: a scalar, a vec2 (position / scale) or a vec4 (an RGBA
// colour keyframe, B33). Pure leaf module (imports only types) so the keyframe assistants, the motion
// rigs and the harnesses can share one definition of "apply this per component" and never truncate a
// colour to its first two channels.

export type KeyframeValue = number | Vec2 | Vec4;

/** Apply `f` to every component, keeping the value's shape. */
export function mapValue(v: KeyframeValue, f: (x: number, i: number) => number): KeyframeValue {
  if (typeof v === 'number') return f(v, 0);
  if (v.length === 2) return [f(v[0], 0), f(v[1], 1)];
  return [f(v[0], 0), f(v[1], 1), f(v[2], 2), f(v[3], 3)];
}

/** Component `i` of a value (a scalar broadcasts; a missing component reads as the last one). */
export function component(v: KeyframeValue, i: number): number {
  if (typeof v === 'number') return v;
  return i < v.length ? v[i] : v[v.length - 1];
}

/** Combine several values component-wise; the result takes the shape of `vals[0]`. */
export function zipValues(vals: readonly KeyframeValue[], f: (xs: number[], i: number) => number): KeyframeValue {
  return mapValue(vals[0], (_x, i) => f(vals.map((v) => component(v, i)), i));
}

/** Deep copy (arrays are fresh). */
export function cloneValue(v: KeyframeValue): KeyframeValue {
  return mapValue(v, (x) => x);
}
