import type { Layer } from './types';

// ─── Timeline Snap Engine ───
// Handles temporal snapping for clip edges, playhead, and keyframes.

export const TIMELINE_SNAP_PX = 8;

export interface TimelineSnapSource {
  time: number;
  type: 'clip-start' | 'clip-end' | 'playhead' | 'keyframe';
  layerId?: string;
}

export interface TimelineSnapLine {
  frame: number;
  type: 'clip-start' | 'clip-end' | 'playhead' | 'keyframe';
}

export interface TimelineSnapResult {
  snappedFrame: number;
  didSnap: boolean;
  snapLines: TimelineSnapLine[];
}

// ─── Build sorted snap sources from all clips except the dragged one ───

export function buildClipSnapSources(
  layers: Layer[],
  excludeId: string
): TimelineSnapSource[] {
  const sources: TimelineSnapSource[] = [];

  for (const layer of layers) {
    if (layer.id === excludeId) continue;
    if (!layer.visible) continue;
    sources.push({ time: layer.inPoint, type: 'clip-start', layerId: layer.id });
    sources.push({ time: layer.outPoint, type: 'clip-end', layerId: layer.id });
  }

  // Sort for binary search
  sources.sort((a, b) => a.time - b.time);
  return sources;
}

// ─── Binary search: find nearest source within threshold ───

function findNearest(
  sources: TimelineSnapSource[],
  target: number,
  threshold: number
): TimelineSnapSource | null {
  if (sources.length === 0) return null;

  let lo = 0;
  let hi = sources.length - 1;

  // Binary search for insertion point
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sources[mid].time < target) lo = mid + 1;
    else hi = mid - 1;
  }

  // Check lo-1, lo, lo+1 for closest match
  let best: TimelineSnapSource | null = null;
  let bestDist = Infinity;

  for (let i = Math.max(0, lo - 1); i <= Math.min(sources.length - 1, lo + 1); i++) {
    const dist = Math.abs(sources[i].time - target);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      best = sources[i];
    }
  }

  return best;
}

// ─── Single-edge snap ───

export function calculateTimelineSnap(
  rawFrame: number,
  sources: TimelineSnapSource[],
  playheadFrame: number | null,
  thresholdFrames: number,
  enabled: boolean
): TimelineSnapResult {
  if (!enabled) {
    return { snappedFrame: rawFrame, didSnap: false, snapLines: [] };
  }

  // Priority 1: Playhead
  if (playheadFrame !== null) {
    const dist = Math.abs(rawFrame - playheadFrame);
    if (dist <= thresholdFrames) {
      return {
        snappedFrame: playheadFrame,
        didSnap: true,
        snapLines: [{ frame: playheadFrame, type: 'playhead' }],
      };
    }
  }

  // Priority 2: Clip edges (binary search)
  const nearest = findNearest(sources, rawFrame, thresholdFrames);
  if (nearest) {
    return {
      snappedFrame: nearest.time,
      didSnap: true,
      snapLines: [{ frame: nearest.time, type: nearest.type }],
    };
  }

  return { snappedFrame: rawFrame, didSnap: false, snapLines: [] };
}

// ─── Clip move snap (checks both start and end edges) ───

export function calculateClipMoveSnap(
  rawStartFrame: number,
  clipDuration: number,
  sources: TimelineSnapSource[],
  playheadFrame: number | null,
  thresholdFrames: number,
  enabled: boolean
): TimelineSnapResult {
  if (!enabled) {
    return { snappedFrame: rawStartFrame, didSnap: false, snapLines: [] };
  }

  const rawEndFrame = rawStartFrame + clipDuration;

  // Try snapping the start edge
  const startSnap = calculateTimelineSnap(rawStartFrame, sources, playheadFrame, thresholdFrames, true);

  // Try snapping the end edge
  const endSnap = calculateTimelineSnap(rawEndFrame, sources, playheadFrame, thresholdFrames, true);

  // Neither snaps
  if (!startSnap.didSnap && !endSnap.didSnap) {
    return { snappedFrame: rawStartFrame, didSnap: false, snapLines: [] };
  }

  // Only start snaps
  if (startSnap.didSnap && !endSnap.didSnap) {
    return startSnap;
  }

  // Only end snaps
  if (!startSnap.didSnap && endSnap.didSnap) {
    return {
      snappedFrame: endSnap.snappedFrame - clipDuration,
      didSnap: true,
      snapLines: endSnap.snapLines,
    };
  }

  // Both snap: pick whichever is closer to raw position
  const startDist = Math.abs(startSnap.snappedFrame - rawStartFrame);
  const endDist = Math.abs((endSnap.snappedFrame - clipDuration) - rawStartFrame);

  if (startDist <= endDist) {
    return startSnap;
  } else {
    return {
      snappedFrame: endSnap.snappedFrame - clipDuration,
      didSnap: true,
      snapLines: endSnap.snapLines,
    };
  }
}

// ─── Keyframe Playhead Snap ───

export function findNearestKeyframeFrame(
  keyframeTimes: number[],
  targetFrame: number,
  thresholdFrames: number
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;

  for (const kf of keyframeTimes) {
    const dist = Math.abs(kf - targetFrame);
    if (dist <= thresholdFrames && dist < bestDist) {
      bestDist = dist;
      best = kf;
    }
  }

  return best;
}

// ─── Threshold conversion utility ───

export function pixelThresholdToFrames(
  pixelThreshold: number,
  frameWidthPx: number
): number {
  return pixelThreshold / Math.max(0.01, frameWidthPx);
}
