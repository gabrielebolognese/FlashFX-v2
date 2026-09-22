import type { Keyframe, Vec2 } from '../types';
import type { EasingName } from '../easings';

// Motion-design principle rigs (B32) - pure keyframe-array transforms (leaf module, imports only types,
// so esbuild bundles it standalone; mirrors core/keyframeAssistants.ts). One-click behaviours that
// rewrite a property's keyframes: anticipation (a small counter-move before the action), follow-through
// (an overshoot/settle ease into the rest pose), squash & stretch (volume-preserving scale driven by
// motion speed), and a frame shift (for staggered offset across layers). Output is ordinary keyframes
// evaluated by the existing interpolation/easing system, so everything plays + exports frame-purely.
// Deterministic; unit-tested by scripts/verify-motion-rigs.mjs. Stagger ORDER + apply-to-selection live
// in the store (reusing stagger/computeStaggerOffsets); this module is the per-property math.

type Val = number | Vec2;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const isVec = (v: Val): v is Vec2 => Array.isArray(v);
const subVal = (a: Val, b: Val): Val => (isVec(a) && isVec(b) ? [a[0] - b[0], a[1] - b[1]] : (a as number) - (b as number));
const scaleVal = (a: Val, s: number): Val => (isVec(a) ? [a[0] * s, a[1] * s] : (a as number) * s);
const toVec = (v: Val): Vec2 => (isVec(v) ? [v[0], v[1]] : [v as number, v as number]);

function mkKf(frame: number, value: Val, interpolation: Keyframe['interpolation'] = 'linear', easing?: EasingName): Keyframe {
  const k: Keyframe = { frame, value, interpolation, handleIn: [0, 0], handleOut: [0, 0] };
  if (easing) k.easing = easing;
  return k;
}
function cloneKf(k: Keyframe): Keyframe {
  return { ...k, value: isVec(k.value) ? [k.value[0], k.value[1]] : k.value, handleIn: [k.handleIn[0], k.handleIn[1]], handleOut: [k.handleOut[0], k.handleOut[1]] };
}
const sortKfs = (kfs: Keyframe[]): Keyframe[] => [...kfs].sort((a, b) => a.frame - b.frame);

export interface AnticipationOptions {
  /** Counter-move size as a fraction of the first move (0..1). */
  amount?: number;
  /** Where in the first segment the windup sits (0..0.9 of the gap). */
  position?: number;
}

/**
 * Anticipation: before the first move, dip slightly OPPOSITE it (a windup), then launch. Inserts one
 * keyframe between the first two, valued `first - amount*(second-first)`. Needs >= 2 keyframes and a
 * gap of >= 2 frames; otherwise returns a clone unchanged. Works on number or vec2 properties.
 */
export function addAnticipation(kfs: Keyframe[], opts: AnticipationOptions = {}): Keyframe[] {
  const sorted = sortKfs(kfs).map(cloneKf);
  if (sorted.length < 2) return sorted;
  const amount = clamp(opts.amount ?? 0.25, 0, 1);
  const pos = clamp(opts.position ?? 0.35, 0.05, 0.9);
  const a = sorted[0], b = sorted[1];
  const gap = b.frame - a.frame;
  if (gap < 2) return sorted;
  const antiFrame = a.frame + Math.max(1, Math.min(gap - 1, Math.round(gap * pos)));
  const windup = subVal(a.value, scaleVal(subVal(b.value, a.value), amount));
  sorted.splice(1, 0, mkKf(antiFrame, windup, 'bezier', 'cubicIn'));
  return sortKfs(sorted);
}

export type OvershootEase = 'backOut' | 'elasticOut' | 'bounceOut';

/**
 * Follow-through / overlapping action: make the motion settle INTO its final rest pose with an
 * overshoot/decaying ease. Sets `easing` on the segment before the last keyframe (which
 * keyframeEase.segmentProgress renders live - no baking). Needs >= 2 keyframes.
 */
export function addFollowThrough(kfs: Keyframe[], ease: OvershootEase = 'backOut'): Keyframe[] {
  const sorted = sortKfs(kfs).map(cloneKf);
  if (sorted.length < 2) return sorted;
  const i = sorted.length - 2;
  sorted[i] = { ...sorted[i], easing: ease, interpolation: sorted[i].interpolation === 'hold' ? 'linear' : sorted[i].interpolation };
  return sorted;
}

/** Linear-sample a vec2 (position) keyframe track at `frame` (clamped at the ends). `sorted` must be
 *  frame-ascending. */
function samplePos(sorted: Keyframe[], frame: number): Vec2 {
  const n = sorted.length;
  if (n === 0) return [0, 0];
  if (frame <= sorted[0].frame) return toVec(sorted[0].value);
  if (frame >= sorted[n - 1].frame) return toVec(sorted[n - 1].value);
  for (let i = 0; i < n - 1; i++) {
    if (frame >= sorted[i].frame && frame <= sorted[i + 1].frame) {
      const span = sorted[i + 1].frame - sorted[i].frame || 1;
      const t = (frame - sorted[i].frame) / span;
      const p = toVec(sorted[i].value), q = toVec(sorted[i + 1].value);
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    }
  }
  return toVec(sorted[n - 1].value);
}

export interface SquashStretchOptions {
  /** Peak stretch strength (0..1). */
  amount?: number;
  /** Rest scale the stretch multiplies (default [1,1]). */
  baseline?: Vec2;
  /** Max stretch cap so fast frames stay sane (default 0.6). */
  cap?: number;
}

/**
 * Squash & stretch: bake per-frame SCALE keyframes over [startFrame,endFrame] driven by the speed of a
 * position track. Fast frames stretch along the dominant motion axis and squash the other,
 * volume-preserving (scaleX*scaleY = baseline area). At rest the scale is exactly the baseline. Speed
 * is a finite difference of a linear position sample, normalised to the peak speed in the range.
 */
export function buildSquashStretch(posKfs: Keyframe[], startFrame: number, endFrame: number, opts: SquashStretchOptions = {}): Keyframe[] {
  const amount = clamp(opts.amount ?? 0.3, 0, 1);
  const cap = clamp(opts.cap ?? 0.6, 0, 0.95);
  const base = opts.baseline ?? [1, 1];
  const sorted = sortKfs(posKfs);
  const lo = Math.min(startFrame, endFrame), hi = Math.max(startFrame, endFrame);
  const speeds: number[] = [];
  const vertical: boolean[] = [];
  let maxSpeed = 0;
  for (let f = lo; f <= hi; f++) {
    const p0 = samplePos(sorted, f - 1), p1 = samplePos(sorted, f);
    const vx = p1[0] - p0[0], vy = p1[1] - p0[1];
    const sp = Math.hypot(vx, vy);
    speeds.push(sp); vertical.push(Math.abs(vy) >= Math.abs(vx));
    if (sp > maxSpeed) maxSpeed = sp;
  }
  const out: Keyframe[] = [];
  for (let i = 0; i < speeds.length; i++) {
    const norm = maxSpeed > 1e-6 ? speeds[i] / maxSpeed : 0;
    const k = clamp(amount * norm, 0, cap);
    const hiS = 1 + k, loS = 1 / (1 + k); // hiS * loS = 1 -> volume preserved
    const sx = vertical[i] ? loS : hiS;
    const sy = vertical[i] ? hiS : loS;
    out.push(mkKf(lo + i, [base[0] * sx, base[1] * sy], 'bezier'));
  }
  return out;
}

/** Shift every keyframe's frame by `delta` (for a keyframe-based staggered offset). Frames below 0 are
 *  clamped to 0; on a collision the later (higher original frame) wins. */
export function shiftKeyframes(kfs: Keyframe[], delta: number): Keyframe[] {
  const d = Math.round(delta);
  const byFrame = new Map<number, Keyframe>();
  for (const k of sortKfs(kfs)) {
    const nf = Math.max(0, k.frame + d);
    byFrame.set(nf, { ...cloneKf(k), frame: nf });
  }
  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}
