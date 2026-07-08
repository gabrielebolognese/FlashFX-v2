import type { SilenceRegion, SilenceSettings } from './silenceDetection';

// Maps a clip's timeline span to its source media, so silence found in source
// time can be expressed as clip-local composition frames and back. Mirrors the
// `(layerFrame + startOffset) * playbackRate * (sourceFR / compFR)` mapping the
// renderer and audio engine use. For audio, playbackRate is 1.
export interface ClipSourceMapping {
  inPoint: number;
  outPoint: number;
  startOffset: number;
  playbackRate: number;
  frameRate: number;
}

// A retained speech span, expressed as an offset into the source (local frames
// past the clip's existing startOffset) and a length in composition frames.
export interface SpeechSegment {
  sourceLocalStart: number;
  lengthFrames: number;
}

export interface CutPlan {
  segments: SpeechSegment[];
  // Local-frame intervals (relative to the original clip inPoint) for the
  // timeline overlay — what gets removed (silence) vs kept (speech).
  silenceLocal: { startFrame: number; endFrame: number }[];
  speechLocal: { startFrame: number; endFrame: number }[];
  removedFrames: number;
  cuts: number;
  isAllSilence: boolean;
}

function sourceSecToLocalFrame(srcSec: number, m: ClipSourceMapping): number {
  return (srcSec * m.frameRate) / m.playbackRate - m.startOffset;
}

// Translate detected silence (source seconds) into a split-and-shuffle plan of
// retained speech segments laid out gaplessly. The clip's own trim window
// [0, clipLen) bounds everything; silence outside it is ignored.
export function buildCutPlan(
  regions: SilenceRegion[],
  mapping: ClipSourceMapping,
  settings: SilenceSettings,
): CutPlan {
  const clipLenFrames = mapping.outPoint - mapping.inPoint;
  const minSpeechFrames = Math.max(1, Math.round(settings.minSpeechSec * mapping.frameRate));

  // Clamp silence to the clip's trim window and merge overlaps.
  const silence: { startFrame: number; endFrame: number }[] = [];
  for (const r of regions) {
    const start = Math.max(0, Math.round(sourceSecToLocalFrame(r.startSec, mapping)));
    const end = Math.min(clipLenFrames, Math.round(sourceSecToLocalFrame(r.endSec, mapping)));
    if (end - start <= 0) continue;
    silence.push({ startFrame: start, endFrame: end });
  }
  silence.sort((a, b) => a.startFrame - b.startFrame);

  const mergedSilence: { startFrame: number; endFrame: number }[] = [];
  for (const s of silence) {
    const last = mergedSilence[mergedSilence.length - 1];
    if (last && s.startFrame <= last.endFrame) {
      last.endFrame = Math.max(last.endFrame, s.endFrame);
    } else {
      mergedSilence.push({ ...s });
    }
  }

  // Complement of silence within [0, clipLen) is speech.
  const speechLocal: { startFrame: number; endFrame: number }[] = [];
  let cursor = 0;
  for (const s of mergedSilence) {
    if (s.startFrame > cursor) {
      speechLocal.push({ startFrame: cursor, endFrame: s.startFrame });
    }
    cursor = Math.max(cursor, s.endFrame);
  }
  if (cursor < clipLenFrames) {
    speechLocal.push({ startFrame: cursor, endFrame: clipLenFrames });
  }

  // Discard unusably short speech fragments.
  const keptSpeech = speechLocal.filter((s) => s.endFrame - s.startFrame >= minSpeechFrames);

  const segments: SpeechSegment[] = keptSpeech.map((s) => ({
    sourceLocalStart: s.startFrame,
    lengthFrames: s.endFrame - s.startFrame,
  }));

  const keptFrames = segments.reduce((sum, s) => sum + s.lengthFrames, 0);
  const removedFrames = clipLenFrames - keptFrames;

  return {
    segments,
    silenceLocal: mergedSilence,
    speechLocal: keptSpeech,
    removedFrames,
    cuts: mergedSilence.length,
    isAllSilence: segments.length === 0,
  };
}
