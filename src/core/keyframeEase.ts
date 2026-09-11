import type { Keyframe } from './types';
import { applyEasing, cubicBezier, springProgress } from './easings';

// THE single source of truth for how a keyframe segment eases in time.
//
// A segment runs from `prev` to `next`. Its shape is owned by the OUTGOING side of `prev` plus the
// INCOMING side of `next` — exactly the After Effects convention (and what the graph editor draws):
//   • hold          → progress 0 for the whole segment (value stays on `prev` until `next`)
//   • named easing   → prev.easing wins (true elastic / bounce / back / Penner curves)
//   • bezier         → cubic-bezier(prev.handleOut, next.handleIn)   ← both control points, one from each end
//   • spring         → fixed damped-cosine
//   • linear/default → t
//
// Historically the renderer read BOTH bezier control points off the START keyframe, so asymmetric
// eases rendered differently from how the graph editor drew them. Routing every consumer through
// this one function removes that class of drift permanently.
export function segmentProgress(t: number, prev: Keyframe, next: Keyframe): number {
  if (prev.interpolation === 'hold') return 0;
  if (prev.easing) return applyEasing(prev.easing, t);
  switch (prev.interpolation) {
    case 'bezier': {
      // Honour authored handles exactly — INCLUDING legitimate zero components (an ease-in has
      // handleOut.y = 0). Only when a handle is fully unset ([0,0], e.g. a keyframe flipped to
      // bezier without dragging) fall back to a gentle default so the curve isn't degenerate.
      const o = prev.handleOut;
      const i = next.handleIn;
      const oUnset = o[0] === 0 && o[1] === 0;
      const iUnset = i[0] === 0 && i[1] === 0;
      return cubicBezier(
        t,
        oUnset ? 0.25 : o[0],
        oUnset ? 0.1 : o[1],
        iUnset ? 0.75 : i[0],
        iUnset ? 0.9 : i[1],
      );
    }
    case 'spring':
      return springProgress(t);
    case 'linear':
    default:
      return t;
  }
}

/** Interpolate a scalar across a segment using {@link segmentProgress}. */
export function easeSegment(from: number, to: number, t: number, prev: Keyframe, next: Keyframe): number {
  return from + (to - from) * segmentProgress(t, prev, next);
}
