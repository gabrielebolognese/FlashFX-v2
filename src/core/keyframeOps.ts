import type { Keyframe, AnimatableProperty, Vec2 } from './types';
import { createKeyframe } from './factory';
import { evaluateNumber, evaluateVec2 } from './interpolation';

// Pure keyframe-array transforms used by the keyframe context menu (Batch 3).
// Each takes the property's full keyframe list (+ the set of SELECTED frames) and
// returns a new list. The store wraps these in one undoable command.

export type TangentMode = 'continuous' | 'broken';

/**
 * Remap the frames of the selected keyframes via `mapFrame`. Unselected keyframes
 * whose frame collides with a moved one are dropped (the moved keyframe wins).
 * Covers move-to-playhead, offset, scale, mirror, and align.
 */
export function remapSelectedFrames(
  kfs: Keyframe[],
  selected: Set<number>,
  mapFrame: (f: number) => number,
): Keyframe[] {
  const unselected = kfs.filter((k) => !selected.has(k.frame));
  const moved = kfs
    .filter((k) => selected.has(k.frame))
    .map((k) => ({ ...k, frame: Math.round(mapFrame(k.frame)) }));
  const movedFrames = new Set(moved.map((m) => m.frame));
  return [...unselected.filter((k) => !movedFrames.has(k.frame)), ...moved].sort((a, b) => a.frame - b.frame);
}

/** Reverse the VALUE sequence of the selected keyframes, keeping their frames. */
export function reverseSelectedValues(kfs: Keyframe[], selected: Set<number>): Keyframe[] {
  const selSorted = kfs.filter((k) => selected.has(k.frame)).sort((a, b) => a.frame - b.frame);
  if (selSorted.length < 2) return kfs;
  const revValues = selSorted.map((k) => k.value).reverse();
  const frameToValue = new Map<number, number | Vec2>();
  selSorted.forEach((k, i) => frameToValue.set(k.frame, revValues[i]));
  return kfs.map((k) => (frameToValue.has(k.frame) ? { ...k, value: frameToValue.get(k.frame)! } : k));
}

/** Redistribute the selected keyframes evenly between the first and last selected. */
export function distributeSelectedEven(kfs: Keyframe[], selected: Set<number>): Keyframe[] {
  const selSorted = kfs.filter((k) => selected.has(k.frame)).sort((a, b) => a.frame - b.frame);
  if (selSorted.length < 3) return kfs;
  const min = selSorted[0].frame;
  const max = selSorted[selSorted.length - 1].frame;
  const step = (max - min) / (selSorted.length - 1);
  const oldToNew = new Map<number, number>();
  selSorted.forEach((k, i) => oldToNew.set(k.frame, Math.round(min + i * step)));
  return remapSelectedFrames(kfs, selected, (f) => oldToNew.get(f) ?? f);
}

/** Snap each selected keyframe to the nearest UNSELECTED keyframe before/after it. */
export function alignSelected(kfs: Keyframe[], selected: Set<number>, dir: 'prev' | 'next'): Keyframe[] {
  const unselFrames = kfs.filter((k) => !selected.has(k.frame)).map((k) => k.frame).sort((a, b) => a - b);
  return remapSelectedFrames(kfs, selected, (f) => {
    if (dir === 'prev') {
      const c = unselFrames.filter((x) => x < f);
      return c.length ? c[c.length - 1] : f;
    }
    const c = unselFrames.filter((x) => x > f);
    return c.length ? c[0] : f;
  });
}

/** Replace the selected span with one keyframe per frame, sampled from the current curve. */
export function bakeSelected(prop: AnimatableProperty, selected: Set<number>): Keyframe[] {
  const selFrames = [...selected].sort((a, b) => a - b);
  if (selFrames.length < 2) return prop.keyframes;
  const min = selFrames[0];
  const max = selFrames[selFrames.length - 1];
  const outside = prop.keyframes.filter((k) => k.frame < min || k.frame > max);
  const baked: Keyframe[] = [];
  for (let f = min; f <= max; f++) {
    const value = prop.valueType === 'vec2' ? evaluateVec2(prop, f) : evaluateNumber(prop, f);
    baked.push(createKeyframe(f, value as number | Vec2, 'linear'));
  }
  return [...outside, ...baked].sort((a, b) => a.frame - b.frame);
}

/**
 * Set the bezier tangent mode on the selected keyframes. `continuous` mirrors the
 * out-handle to the in-handle so the tangent is smooth; `broken` leaves handles
 * independent. Both force `interpolation: 'bezier'`.
 */
export function setSelectedTangentMode(kfs: Keyframe[], selected: Set<number>, mode: TangentMode): Keyframe[] {
  return kfs.map((k) => {
    if (!selected.has(k.frame)) return k;
    if (mode === 'continuous') {
      const hOut = k.handleOut;
      return {
        ...k,
        interpolation: 'bezier' as const,
        tangentMode: 'continuous' as const,
        handleIn: [1 - hOut[0], 1 - hOut[1]] as Vec2,
      };
    }
    return { ...k, interpolation: 'bezier' as const, tangentMode: 'broken' as const };
  });
}

/** Clone the selected keyframes shifted forward by their span (so they follow the originals). */
export function duplicateSelected(kfs: Keyframe[], selected: Set<number>): Keyframe[] {
  const sel = kfs.filter((k) => selected.has(k.frame)).sort((a, b) => a.frame - b.frame);
  if (sel.length === 0) return kfs;
  const span = sel[sel.length - 1].frame - sel[0].frame;
  const offset = span > 0 ? span + 1 : 10;
  const clones = sel.map((k) => ({ ...k, frame: k.frame + offset }));
  const cloneFrames = new Set(clones.map((c) => c.frame));
  return [...kfs.filter((k) => !cloneFrames.has(k.frame)), ...clones].sort((a, b) => a.frame - b.frame);
}

/** Copy the selected keyframes with frames rebased so the earliest is 0 (for the clipboard). */
export function extractForClipboard(prop: AnimatableProperty, selected: Set<number>): Keyframe[] {
  const sel = prop.keyframes.filter((k) => selected.has(k.frame)).sort((a, b) => a.frame - b.frame);
  if (sel.length === 0) return [];
  const base = sel[0].frame;
  return sel.map((k) => ({ ...k, frame: k.frame - base }));
}

/** Insert rebased clipboard keyframes at `atFrame`; existing keyframes at collided frames are replaced. */
export function insertClipboard(kfs: Keyframe[], clip: Keyframe[], atFrame: number): Keyframe[] {
  const placed = clip.map((k) => ({ ...k, frame: k.frame + atFrame }));
  const placedFrames = new Set(placed.map((p) => p.frame));
  return [...kfs.filter((k) => !placedFrames.has(k.frame)), ...placed].sort((a, b) => a.frame - b.frame);
}
