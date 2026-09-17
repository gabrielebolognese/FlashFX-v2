// Pure procedural-motion helpers for the expression language (B7). These are the maths behind the
// AE-style motion vocabulary - offset loops, inertial bounce/spring, posterize-time, and
// valueAtTime-based lag/delay/follow (secondary motion). Kept in a LEAF module that imports only
// TYPES (no worker globals, no DOM, no `self`) so it bundles in a plain node verify harness
// (`verify:expressions-motion`). The worker (`worker.ts`) imports these and exposes them in the
// expression scope; the render side never touches this file directly.

import type { Vec2 } from '../core/types';
import type { KeyframeData } from './types';

type Val = number | Vec2;

function cloneVal(v: Val): Val {
  return typeof v === 'number' ? v : [v[0], v[1]];
}

// Read a value as a scalar / as a 2-vector regardless of how it was stored, so a property that mixes
// scalar and vec keyframes (shouldn't happen, but is cheap to tolerate) never throws.
function asNum(v: Val): number {
  return typeof v === 'number' ? v : v[0];
}
function asVec(v: Val): Vec2 {
  return typeof v === 'number' ? [v, v] : v;
}

/**
 * Linear interpolation of a keyframe list at an arbitrary (possibly fractional) frame, clamping to the
 * first/last value outside the keyed range. Single source of truth for every time-sampling helper here
 * (loops, lag, posterize) AND for the worker's loopIn/loopOut cycle/pingpong paths - byte-identical to
 * the logic it replaces. Returns a scalar when both bracketing keys are scalar, else a Vec2.
 */
export function interpolateKeyframesAt(keyframes: KeyframeData[], frame: number): Val {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return cloneVal(keyframes[0].value);

  if (frame <= keyframes[0].frame) return cloneVal(keyframes[0].value);
  const lastKf = keyframes[keyframes.length - 1];
  if (frame >= lastKf.frame) return cloneVal(lastKf.value);

  let idx = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (frame >= keyframes[i].frame && frame <= keyframes[i + 1].frame) {
      idx = i;
      break;
    }
  }

  const kf0 = keyframes[idx];
  const kf1 = keyframes[idx + 1];
  const span = kf1.frame - kf0.frame;
  const t = span === 0 ? 0 : (frame - kf0.frame) / span;

  if (typeof kf0.value === 'number' && typeof kf1.value === 'number') {
    return kf0.value + (kf1.value - kf0.value) * t;
  }
  const v0 = asVec(kf0.value);
  const v1 = asVec(kf1.value);
  return [v0[0] + (v1[0] - v0[0]) * t, v0[1] + (v1[1] - v0[1]) * t];
}

/**
 * Offset loop (`loopOut('offset')` / `loopIn('offset')`). Unlike a cycle, each repetition is displaced
 * by the segment's total value change, so the motion ACCUMULATES continuously (a walk cycle that keeps
 * advancing, a value that ratchets). Implements the periodic extension E(f) with
 * E(f + range) = E(f) + (lastValue − firstValue): it is continuous at BOTH the first and last keyframe
 * (E(lastFrame) === lastValue, E(firstFrame) === firstValue) and so works for forward and backward
 * extrapolation with one formula. Callers only reach it OUTSIDE the keyed range.
 */
export function loopOffset(keyframes: KeyframeData[], frame: number): Val {
  if (keyframes.length < 2) return cloneVal(keyframes[0]?.value ?? 0);
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  const range = last.frame - first.frame;
  if (range <= 0) return cloneVal(last.value);

  const n = Math.floor((frame - first.frame) / range);
  const fLocal = frame - n * range; // lands in [first.frame, last.frame]
  const base = interpolateKeyframesAt(keyframes, fLocal);

  if (typeof base === 'number') {
    return base + n * (asNum(last.value) - asNum(first.value));
  }
  const dl = asVec(last.value);
  const df = asVec(first.value);
  return [base[0] + n * (dl[0] - df[0]), base[1] + n * (dl[1] - df[1])];
}

/**
 * Inertial bounce / spring overshoot (Ebberts-style). After the LAST keyframe the property overshoots
 * and settles, driven by the velocity coming into that keyframe: a decaying sine
 * `value + velocity · amp · sin(2π·freq·t) / e^(decay·t)`. Continuous at the last keyframe (t=0 → the
 * oscillation is 0) and asymptotically settles back to the last value. Only applies past the last key;
 * inside the keyed range it returns the already-evaluated `value` so the authored animation is intact.
 *
 * @param fps    comp frame rate (velocity is measured per-second so freq/decay read in Hz / per-second)
 * @param freq   oscillations per second (default 2)
 * @param decay  exponential decay rate per second (default 4 - higher settles faster)
 * @param amp    overshoot amplitude as a fraction of the incoming per-second velocity (default 0.1)
 */
export function inertialBounce(
  keyframes: KeyframeData[],
  frame: number,
  value: Val,
  fps: number,
  freq = 2,
  decay = 4,
  amp = 0.1,
): Val {
  if (keyframes.length < 2) return cloneVal(value);
  const last = keyframes[keyframes.length - 1];
  const prev = keyframes[keyframes.length - 2];
  if (frame <= last.frame) return cloneVal(value); // inside the keyed range → authored value
  const spanFrames = last.frame - prev.frame;
  if (spanFrames <= 0 || fps <= 0) return cloneVal(last.value);

  const dtSec = (frame - last.frame) / fps;
  const osc = (amp * Math.sin(freq * dtSec * 2 * Math.PI)) / Math.exp(decay * dtSec);
  const spanSec = spanFrames / fps;

  if (typeof last.value === 'number') {
    const vel = (last.value - asNum(prev.value)) / spanSec;
    return last.value + vel * osc;
  }
  const lv = asVec(last.value);
  const pv = asVec(prev.value);
  return [lv[0] + ((lv[0] - pv[0]) / spanSec) * osc, lv[1] + ((lv[1] - pv[1]) / spanSec) * osc];
}

/**
 * Posterize-time: snap a time (in seconds) to a coarser rate, e.g. `posterizeTimeSeconds(time, 12)`
 * gives a 12-steps-per-second staircase. Feed the result to `valueAtTime()` for stepped/robotic motion.
 * `rate <= 0` is a no-op (returns the time unchanged). Pure and monotonic.
 */
export function posterizeTimeSeconds(timeSec: number, rate: number): number {
  if (rate <= 0) return timeSec;
  return Math.floor(timeSec * rate) / rate;
}
