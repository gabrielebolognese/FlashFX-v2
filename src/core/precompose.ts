// Precompose — the pure "wrap selected layers into a new sub-composition" transform.
//
// Modeled on the store's createGroup, but for precomposition: instead of a
// transform-only container, it moves the selected layers (+ their descendants) into
// a NEW Composition and leaves a single precomp layer referencing it in their place.
// Kept pure (no store/history) so it is unit-testable; the store action is a thin
// wrapper that snapshots the composition registry for undo.
//
// KEY difference from createGroup: transforms are preserved VERBATIM (world coords +
// keyframes) and the precomp layer gets an identity transform, so nothing moves.

import { createComposition, createPrecompLayer } from './factory';
import type { Composition, Layer, PrecompLayer } from './types';

/** rootIds plus every layer whose parent chain leads to one of them (descendants). */
function collectWithDescendants(rootIds: string[], layers: Layer[]): Set<string> {
  const set = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of layers) {
      if (!set.has(l.id) && l.parentId && set.has(l.parentId)) {
        set.add(l.id);
        changed = true;
      }
    }
  }
  return set;
}

export interface PrecomposeResult {
  /** The new sub-composition holding the moved layers (unsettled — the caller
   *  ensures tracks + settles it, to reuse the store's helpers). */
  subComposition: Composition;
  /** The precomp layer to insert into the parent. */
  precompLayer: PrecompLayer;
  /** The parent's new layer list (moved layers removed, precomp inserted in place). */
  parentLayers: Layer[];
}

/**
 * Compute the precompose split. Returns null if nothing is selected / movable.
 * The sub-composition inherits the parent's settings; moved layers keep their world
 * transforms + keyframes; a parent reference that isn't itself moved is rooted
 * (parentId cleared) so the sub-composition has no dangling parent links.
 */
export function buildPrecompose(
  composition: Composition,
  selectedIds: string[],
  subName: string,
): PrecomposeResult | null {
  if (selectedIds.length === 0) return null;
  const idSet = collectWithDescendants(selectedIds, composition.layers);
  const moved = composition.layers.filter((l) => idSet.has(l.id));
  if (moved.length === 0) return null;

  const subComposition = createComposition(subName, { ...composition.settings });
  subComposition.layers = moved.map((l) => ({
    ...l,
    trackId: null,
    parentId: l.parentId && idSet.has(l.parentId) ? l.parentId : null,
  }));

  const inPoint = Math.min(...moved.map((l) => l.inPoint));
  const outPoint = Math.max(...moved.map((l) => l.outPoint));
  const precompLayer: PrecompLayer = {
    ...createPrecompLayer(subName, subComposition.id, composition.settings.durationFrames),
    inPoint,
    outPoint,
  };

  // Insert the precomp where the first selected layer was, among the survivors.
  const firstIdx = composition.layers.findIndex((l) => idSet.has(l.id));
  const beforeCount = composition.layers.slice(0, firstIdx).filter((l) => !idSet.has(l.id)).length;
  const remaining = composition.layers.filter((l) => !idSet.has(l.id));
  const parentLayers = [...remaining.slice(0, beforeCount), precompLayer, ...remaining.slice(beforeCount)];

  return { subComposition, precompLayer, parentLayers };
}
