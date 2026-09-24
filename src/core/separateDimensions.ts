import type { Keyframe, Vec2 } from './types';
import { segmentProgress } from './keyframeEase';

// Separate Dimensions: pure split / merge / per-axis evaluation for a position property. Pure leaf
// module (only keyframeEase → easings, no worker/DOM), so both the renderer and the store use it and
// it bundles in a harness. "Separate" splits the combined vec2 curve into two scalar curves with the
// SAME frames + easing (byte-identical motion the instant it separates); "merge" re-couples them by
// sampling the current per-axis motion at the union of their frames.

/**
 * Index of the keyframe that STARTS the segment containing `frame`, via binary search. BYTE-IDENTICAL
 * to the old linear "first i where kf[i].frame <= frame <= kf[i+1].frame" scan: it returns the largest
 * i with `keyframes[i].frame < frame`, which is exactly the index that first-match scan selects
 * (including picking the segment that ENDS at an exact interior keyframe), so downstream interpolation
 * is unchanged. Preconditions: length >= 2 and keyframes[0].frame < frame < keyframes[last].frame -
 * callers handle the empty/single/endpoint cases first. O(log n) instead of O(n) for dense curves.
 */
export function findSegmentIndex(keyframes: Keyframe[], frame: number): number {
  let lo = 0, hi = keyframes.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid].frame < frame) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}

/** Evaluate one scalar keyframe list at a frame (holds before the first key; clamps to endpoints). */
export function evalScalarKeyframes(keyframes: Keyframe[] | undefined, defaultValue: number, frame: number): number {
  if (!keyframes || keyframes.length === 0) return defaultValue;
  if (keyframes.length === 1) return frame < keyframes[0].frame ? defaultValue : (keyframes[0].value as number);
  if (frame <= keyframes[0].frame) return keyframes[0].value as number;
  if (frame >= keyframes[keyframes.length - 1].frame) return keyframes[keyframes.length - 1].value as number;
  const i = findSegmentIndex(keyframes, frame);
  const prev = keyframes[i];
  const next = keyframes[i + 1];
  const dur = next.frame - prev.frame;
  const t = dur === 0 ? 0 : Math.min(1, Math.max(0, (frame - prev.frame) / dur));
  const from = prev.value as number;
  const to = next.value as number;
  return from + (to - from) * segmentProgress(t, prev, next);
}

/** Split a combined vec2 keyframe list into independent X and Y scalar lists (same frames + easing). */
export function splitDimensions(keyframes: Keyframe[]): { x: Keyframe[]; y: Keyframe[] } {
  const axis = (a: 0 | 1): Keyframe[] => keyframes.map((k) => ({
    frame: k.frame,
    value: (k.value as Vec2)[a],
    interpolation: k.interpolation,
    handleIn: k.handleIn,
    handleOut: k.handleOut,
    ...(k.easing ? { easing: k.easing } : {}),
  }));
  return { x: axis(0), y: axis(1) };
}

/** Re-couple two axis curves into combined vec2 keyframes at the union of their frames (motion exact
 *  AT those frames; linear between them). Endpoints and every authored per-axis key are represented. */
export function mergeDimensions(
  keyframesX: Keyframe[] | undefined,
  keyframesY: Keyframe[] | undefined,
  defaultX: number,
  defaultY: number,
): Keyframe[] {
  const frames = Array.from(new Set<number>([
    ...(keyframesX ?? []).map((k) => k.frame),
    ...(keyframesY ?? []).map((k) => k.frame),
  ])).sort((a, b) => a - b);
  return frames.map((f) => ({
    frame: f,
    value: [evalScalarKeyframes(keyframesX, defaultX, f), evalScalarKeyframes(keyframesY, defaultY, f)] as Vec2,
    interpolation: 'linear' as const,
    handleIn: [0, 0] as Vec2,
    handleOut: [0, 0] as Vec2,
  }));
}
