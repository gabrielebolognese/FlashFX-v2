import type { TimelineState, Sequence, TimelineMarker, AnimationState } from '../../animation-engine/types';
import type { SerializedTimeline, SerializedMarker, SerializedSequence } from '../types';
import { FORMAT_VERSION } from '../types';
import { DEFAULT_TIMELINE_STATE } from '../../animation-engine/types';

export function serializeTimeline(animationState: AnimationState): SerializedTimeline {
  const { timeline, sequences, activeSequenceId } = animationState;

  return {
    formatVersion: FORMAT_VERSION,
    totalDuration: timeline.duration,
    frameRate: timeline.fps,
    pixelsPerSecond: timeline.pixelsPerSecond,
    loop: timeline.loop,
    snapToMarkers: timeline.snapToMarkers,
    markers: timeline.markers.map(serializeMarker),
    sequences: Object.values(sequences).map(serializeSequence),
    activeSequenceId: activeSequenceId,
  };
}

function serializeMarker(marker: TimelineMarker): SerializedMarker {
  return {
    id: marker.id,
    time: marker.time,
    name: marker.name,
    color: marker.color,
  };
}

function serializeSequence(seq: Sequence): SerializedSequence {
  return {
    id: seq.id,
    name: seq.name,
    frameRate: seq.frameRate,
    duration: seq.duration,
    canvasId: seq.canvasId,
    createdAt: seq.createdAt,
    updatedAt: seq.updatedAt,
  };
}

export function deserializeTimeline(file: SerializedTimeline): {
  timeline: Partial<TimelineState>;
  sequences: Record<string, Sequence>;
  activeSequenceId: string | null;
} {
  const timeline: Partial<TimelineState> = {
    duration: file.totalDuration ?? DEFAULT_TIMELINE_STATE.duration,
    fps: file.frameRate ?? DEFAULT_TIMELINE_STATE.fps,
    pixelsPerSecond: file.pixelsPerSecond ?? DEFAULT_TIMELINE_STATE.pixelsPerSecond,
    loop: file.loop ?? DEFAULT_TIMELINE_STATE.loop,
    snapToMarkers: file.snapToMarkers ?? DEFAULT_TIMELINE_STATE.snapToMarkers,
    markers: (file.markers ?? []).map(deserializeMarker),
    currentTime: 0,
    isPlaying: false,
    selectedClipId: null,
    selectedKeyframeIds: [],
    currentFrame: 0,
  };

  const sequences: Record<string, Sequence> = {};
  for (const seq of file.sequences ?? []) {
    sequences[seq.id] = deserializeSequence(seq);
  }

  return {
    timeline,
    sequences,
    activeSequenceId: file.activeSequenceId ?? null,
  };
}

function deserializeMarker(m: SerializedMarker): TimelineMarker {
  return {
    id: m.id,
    time: m.time,
    name: m.name,
    color: m.color ?? '#3b82f6',
  };
}

function deserializeSequence(s: SerializedSequence): Sequence {
  const now = Date.now();
  return {
    id: s.id,
    name: s.name,
    frameRate: s.frameRate,
    duration: s.duration,
    canvasId: s.canvasId,
    createdAt: s.createdAt ?? now,
    updatedAt: s.updatedAt ?? now,
  };
}
