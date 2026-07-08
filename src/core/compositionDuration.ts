import type { Composition, CompositionSettings, Layer } from './types';

/**
 * Pure functions for the dynamic-duration model.
 *
 * Architecture:
 *   - `composition.settings.minimumDurationFrames` is the user-configured floor
 *     (the value the user picked at project creation time). It never changes
 *     unless the user explicitly edits it.
 *   - `composition.settings.durationFrames` is the live, content-driven
 *     "actual" duration. It is recomputed automatically whenever clip
 *     in/out points change. The rest of the codebase reads this field, so all
 *     timeline UI, playback, exports, etc. stay in sync without per-call
 *     plumbing.
 *
 * These helpers are pure — they take a snapshot in, return a snapshot out,
 * and never reach into stores. The store layer is responsible for calling
 * `recomputeCompositionDuration(comp)` after any layer mutation.
 */

export function computeFurthestClipEnd(layers: Layer[]): number {
  let max = 0;
  for (const layer of layers) {
    if (layer.outPoint > max) max = layer.outPoint;
  }
  return max;
}

export function getMinimumDuration(settings: CompositionSettings): number {
  // Legacy compositions persisted before this feature have no minimum field;
  // fall back to the original duration value as the floor.
  return settings.minimumDurationFrames ?? settings.durationFrames;
}

export function computeActualDuration(layers: Layer[], minimumDurationFrames: number): number {
  return Math.max(minimumDurationFrames, computeFurthestClipEnd(layers));
}

export function recomputeCompositionDuration(comp: Composition): Composition {
  const minimum = getMinimumDuration(comp.settings);
  const actual = computeActualDuration(comp.layers, minimum);
  if (
    comp.settings.durationFrames === actual &&
    comp.settings.minimumDurationFrames === minimum
  ) {
    return comp;
  }
  return {
    ...comp,
    settings: {
      ...comp.settings,
      minimumDurationFrames: minimum,
      durationFrames: actual,
    },
  };
}

/**
 * Apply a new minimum-duration value (the user-editable floor). The actual
 * duration is recomputed against current content so the timeline never
 * shrinks below what is needed to display every clip.
 */
export function withMinimumDuration(comp: Composition, newMinimum: number): Composition {
  const safe = Math.max(1, Math.round(newMinimum));
  return recomputeCompositionDuration({
    ...comp,
    settings: { ...comp.settings, minimumDurationFrames: safe },
  });
}
