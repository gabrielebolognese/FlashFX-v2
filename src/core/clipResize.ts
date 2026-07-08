import type { Layer } from './types';

export const MIN_CLIP_FRAMES = 1;

export type ResizeEdge = 'left' | 'right';

interface ClipTiming {
  inPoint: number;
  outPoint: number;
}

// Allowed [minDelta, maxDelta] a single clip can move the dragged edge before
// it either hits a same-track neighbour, the frame-0 wall, or its own minimum
// duration. maxDelta may be Infinity on a right edge with no right neighbour —
// the timeline auto-expands to absorb that growth on commit.
function clipDeltaRange(layer: Layer, allLayers: Layer[], edge: ResizeEdge): [number, number] {
  const others = layer.trackId
    ? allLayers.filter((l) => l.trackId === layer.trackId && l.id !== layer.id)
    : [];

  if (edge === 'right') {
    // Shrinking the right edge is bounded by the minimum clip duration.
    const minDelta = layer.inPoint + MIN_CLIP_FRAMES - layer.outPoint;
    // Growing right is bounded by the nearest neighbour that starts at/after us.
    let nearestRight = Infinity;
    for (const o of others) {
      if (o.inPoint >= layer.outPoint && o.inPoint < nearestRight) nearestRight = o.inPoint;
    }
    const maxDelta = nearestRight === Infinity ? Infinity : nearestRight - layer.outPoint;
    return [minDelta, maxDelta];
  }

  // Left edge: the in-point moves. Extending left is bounded by frame 0 and the
  // nearest neighbour that ends at/before us; shrinking is bounded by min duration.
  let nearestLeft = 0;
  for (const o of others) {
    if (o.outPoint <= layer.inPoint && o.outPoint > nearestLeft) nearestLeft = o.outPoint;
  }
  const minDelta = nearestLeft - layer.inPoint;
  const maxDelta = layer.outPoint - MIN_CLIP_FRAMES - layer.inPoint;
  return [minDelta, maxDelta];
}

// The single delta the whole selection can safely move. The most restrictive
// clip wins (first collision defines the limit), and the requested direction is
// never flipped. Returns an integer frame delta.
export function clampGroupResizeDelta(
  allLayers: Layer[],
  selectedIds: string[],
  edge: ResizeEdge,
  requestedDelta: number,
): number {
  let maxPos = Infinity;
  let maxNeg = -Infinity;
  for (const id of selectedIds) {
    const layer = allLayers.find((l) => l.id === id);
    if (!layer) continue;
    const [minD, maxD] = clipDeltaRange(layer, allLayers, edge);
    if (minD > maxNeg) maxNeg = minD;
    if (maxD < maxPos) maxPos = maxD;
  }

  if (requestedDelta >= 0) {
    const limit = maxPos === Infinity ? requestedDelta : Math.min(requestedDelta, maxPos);
    return Math.round(Math.max(0, limit));
  }
  const limit = maxNeg === -Infinity ? requestedDelta : Math.max(requestedDelta, maxNeg);
  return Math.round(Math.min(0, limit));
}

// Apply an already-clamped delta to one clip's timing for the given edge.
export function applyResizeDelta(timing: ClipTiming, edge: ResizeEdge, delta: number): ClipTiming {
  if (edge === 'right') {
    return { inPoint: timing.inPoint, outPoint: timing.outPoint + delta };
  }
  return { inPoint: timing.inPoint + delta, outPoint: timing.outPoint };
}
