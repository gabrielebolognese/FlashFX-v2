// Cloner — stagger: per-instance LOCAL-TIME offset (not a transform modulator).
//
// Instance i plays the SOURCE's own keyframed animation on a time-shifted clock:
// sourceLocalTime(t, i) = t − delayForIndex(i). This is what turns one "scale 0→1"
// keyframe on the source into a wave of elements animating in sequence.
//
// REUSE, don't reinvent: the index→delay mapping (with an easing curve over the
// normalized index) is exactly what the existing stagger module computes, so this
// wires the cloner's fields into `computeStaggerOffsets` rather than duplicating the
// math. delaySeconds is converted to frames via fps (default 30).

import { computeStaggerOffsets } from '../stagger/timing';
import { DEFAULT_STAGGER_CONFIG } from '../stagger/types';
import type { StaggerConfig } from '../stagger/types';
import type { ClonerStagger } from './types';

export const DEFAULT_FPS = 30;

/**
 * Per-instance delay in FRAMES. Reuses the stagger module's eased-normalized-index
 * offsets (linear by default; the optional curve reshapes when each instance fires).
 * Result is integer frames (the stagger module rounds).
 */
export function staggerDelays(stagger: ClonerStagger, count: number, fps: number = DEFAULT_FPS): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];

  const curve = stagger.curve ?? 'linear';
  const config: StaggerConfig = {
    ...DEFAULT_STAGGER_CONFIG,
    gapFrames: stagger.delaySeconds * fps,
    curveProfile: curve,
    // Full curve influence when a non-linear curve is chosen; linear is unaffected.
    curveIntensity: curve === 'linear' ? 0 : 100,
    totalDurationLock: { enabled: false, totalFrames: 0 },
  };

  const ids = Array.from({ length: count }, (_, i) => String(i));
  const offsets = computeStaggerOffsets(ids, config);
  return ids.map((id) => offsets.get(id) ?? 0);
}

/**
 * Instance `index`'s local animation clock at global frame `frameNumber`. Pure
 * arithmetic — scrubbing to any frame returns the same value for the same (frame,
 * index), with no state cached outside the call.
 */
export function sourceLocalTime(
  stagger: ClonerStagger,
  count: number,
  fps: number,
  frameNumber: number,
  index: number,
): number {
  const delays = staggerDelays(stagger, count, fps);
  return frameNumber - (delays[index] ?? 0);
}
