export const SNAP_PIXEL_DISTANCE = 8;

export type SnapType = 'playhead' | 'clipStart' | 'clipEnd' | 'marker';

export interface SnapSource {
  time: number;
  type: SnapType;
  clipId?: string;
}

export interface SnapLine {
  time: number;
  type: SnapType;
}

export function calculateProximityThreshold(pixelsPerSecond: number): number {
  return SNAP_PIXEL_DISTANCE / Math.max(pixelsPerSecond, 1);
}

export function buildClipSources(
  animations: Record<string, { clipStart: number; clipDuration: number }>,
  audioClips: Record<string, { startTime: number; endTime: number }>,
  audioTrackClipIds: string[][],
  videoClips: Record<string, { startTime: number; endTime: number }>,
  videoTrackClipIds: string[][],
  activeClipId: string,
): SnapSource[] {
  const sources: SnapSource[] = [];

  for (const [id, anim] of Object.entries(animations)) {
    if (id === activeClipId) continue;
    sources.push({ time: anim.clipStart, type: 'clipStart', clipId: id });
    sources.push({ time: anim.clipStart + anim.clipDuration, type: 'clipEnd', clipId: id });
  }

  for (const clipIds of audioTrackClipIds) {
    for (const clipId of clipIds) {
      if (clipId === activeClipId) continue;
      const clip = audioClips[clipId];
      if (!clip) continue;
      sources.push({ time: clip.startTime, type: 'clipStart', clipId });
      sources.push({ time: clip.endTime, type: 'clipEnd', clipId });
    }
  }

  for (const clipIds of videoTrackClipIds) {
    for (const clipId of clipIds) {
      if (clipId === activeClipId) continue;
      const clip = videoClips[clipId];
      if (!clip) continue;
      sources.push({ time: clip.startTime, type: 'clipStart', clipId });
      sources.push({ time: clip.endTime, type: 'clipEnd', clipId });
    }
  }

  sources.sort((a, b) => a.time - b.time);
  return sources;
}

function findNearest(sources: SnapSource[], time: number, threshold: number): SnapSource | null {
  if (sources.length === 0) return null;

  let lo = 0;
  let hi = sources.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sources[mid].time < time) lo = mid + 1;
    else hi = mid;
  }

  let best: SnapSource | null = null;
  let bestDist = threshold;

  for (let i = Math.max(0, lo - 1); i <= Math.min(sources.length - 1, lo + 1); i++) {
    const d = Math.abs(sources[i].time - time);
    if (d < bestDist) {
      bestDist = d;
      best = sources[i];
    }
  }

  return best;
}

export function calculateSnap(params: {
  dragPosition: number;
  clipSources: SnapSource[];
  markers: Array<{ time: number }>;
  playheadTime: number;
  snapEnabled: boolean;
  altPressed: boolean;
  proximityThreshold: number;
}): { snappedPosition: number; snapLines: SnapLine[]; didSnap: boolean } {
  const { dragPosition, clipSources, markers, playheadTime, snapEnabled, altPressed, proximityThreshold } = params;

  if (!snapEnabled || altPressed) {
    return { snappedPosition: dragPosition, snapLines: [], didSnap: false };
  }

  const playheadDist = Math.abs(dragPosition - playheadTime);
  if (playheadDist < proximityThreshold) {
    return {
      snappedPosition: playheadTime,
      snapLines: [{ time: playheadTime, type: 'playhead' }],
      didSnap: true,
    };
  }

  for (const marker of markers) {
    const d = Math.abs(dragPosition - marker.time);
    if (d < proximityThreshold) {
      return {
        snappedPosition: marker.time,
        snapLines: [{ time: marker.time, type: 'marker' }],
        didSnap: true,
      };
    }
  }

  const nearest = findNearest(clipSources, dragPosition, proximityThreshold);
  if (nearest) {
    return {
      snappedPosition: nearest.time,
      snapLines: [{ time: nearest.time, type: nearest.type }],
      didSnap: true,
    };
  }

  return { snappedPosition: dragPosition, snapLines: [], didSnap: false };
}

export function calculateMoveSnap(params: {
  rawStartTime: number;
  clipDuration: number;
  clipSources: SnapSource[];
  markers: Array<{ time: number }>;
  playheadTime: number;
  snapEnabled: boolean;
  altPressed: boolean;
  proximityThreshold: number;
}): { snappedStartTime: number; snapLines: SnapLine[]; didSnap: boolean } {
  const { rawStartTime, clipDuration, clipSources, markers, playheadTime, snapEnabled, altPressed, proximityThreshold } = params;

  if (!snapEnabled || altPressed) {
    return { snappedStartTime: rawStartTime, snapLines: [], didSnap: false };
  }

  const rawEndTime = rawStartTime + clipDuration;

  const startResult = calculateSnap({
    dragPosition: rawStartTime,
    clipSources,
    markers,
    playheadTime,
    snapEnabled,
    altPressed,
    proximityThreshold,
  });

  const endResult = calculateSnap({
    dragPosition: rawEndTime,
    clipSources,
    markers,
    playheadTime,
    snapEnabled,
    altPressed,
    proximityThreshold,
  });

  if (!startResult.didSnap && !endResult.didSnap) {
    return { snappedStartTime: rawStartTime, snapLines: [], didSnap: false };
  }

  if (startResult.didSnap && !endResult.didSnap) {
    return {
      snappedStartTime: startResult.snappedPosition,
      snapLines: startResult.snapLines,
      didSnap: true,
    };
  }

  if (!startResult.didSnap && endResult.didSnap) {
    return {
      snappedStartTime: endResult.snappedPosition - clipDuration,
      snapLines: endResult.snapLines,
      didSnap: true,
    };
  }

  const startDist = Math.abs(startResult.snappedPosition - rawStartTime);
  const endDist = Math.abs(endResult.snappedPosition - rawEndTime);

  if (startDist <= endDist) {
    return {
      snappedStartTime: startResult.snappedPosition,
      snapLines: startResult.snapLines,
      didSnap: true,
    };
  }

  return {
    snappedStartTime: endResult.snappedPosition - clipDuration,
    snapLines: endResult.snapLines,
    didSnap: true,
  };
}

export function renderSnapOverlay(
  overlayEl: HTMLElement,
  snapLines: SnapLine[],
  pixelsPerSecond: number,
): void {
  if (snapLines.length === 0) {
    overlayEl.innerHTML = '';
    return;
  }

  overlayEl.innerHTML = snapLines
    .map((line) => {
      const x = line.time * pixelsPerSecond;
      return `<div style="position:absolute;top:0;bottom:0;left:${x}px;width:2px;background:rgba(239,68,68,0.9);pointer-events:none;box-shadow:0 0 6px rgba(239,68,68,0.6);"></div>`;
    })
    .join('');
}
