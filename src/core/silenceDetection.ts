// Pure, DOM-free silence-detection primitives shared by the analysis worker and
// the main-thread live preview. The expensive pass (RMS windowing) runs once in
// a worker and produces a per-window dB array; re-tuning threshold / minimum
// duration / padding only re-runs the cheap `detectSilenceRegions` grouping on
// that cached array, so the preview updates instantly without re-decoding audio.

export interface SilenceSettings {
  // Audio at or below this loudness (dBFS) is considered silence.
  thresholdDb: number;
  // A quiet stretch must last at least this long (seconds) to be removable.
  minSilenceSec: number;
  // Speech-protecting padding (seconds) trimmed off each end of a silence.
  paddingSec: number;
  // Speech fragments shorter than this (seconds) are discarded rather than kept
  // as unusably short clips.
  minSpeechSec: number;
}

export interface RmsAnalysis {
  // Per-window loudness in dBFS. -Infinity for fully silent windows.
  db: Float32Array;
  windowSec: number;
  durationSec: number;
}

export interface SilenceRegion {
  startSec: number;
  endSec: number;
}

export const DEFAULT_SILENCE_SETTINGS: SilenceSettings = {
  thresholdDb: -35,
  minSilenceSec: 0.4,
  paddingSec: 0.1,
  minSpeechSec: 0.15,
};

export const THRESHOLD_MIN_DB = -60;
export const THRESHOLD_MAX_DB = -20;

// 20 ms analysis windows: fine enough to catch short gaps, coarse enough to
// smooth out per-sample noise into a perceptual loudness curve.
export const ANALYSIS_WINDOW_SEC = 0.02;

// Compute per-window RMS loudness (in dBFS) for a mono Float32 PCM buffer.
// Runs inside the analysis worker. `onProgress` reports 0..1 periodically.
export function computeRmsDb(
  samples: Float32Array,
  sampleRate: number,
  windowSec: number,
  onProgress?: (fraction: number) => void,
): RmsAnalysis {
  const windowSize = Math.max(1, Math.round(windowSec * sampleRate));
  const windowCount = Math.max(1, Math.ceil(samples.length / windowSize));
  const db = new Float32Array(windowCount);

  const progressEvery = Math.max(1, Math.floor(windowCount / 50));

  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSize;
    const end = Math.min(samples.length, start + windowSize);
    let sumSquares = 0;
    for (let i = start; i < end; i++) {
      const s = samples[i];
      sumSquares += s * s;
    }
    const count = end - start;
    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    db[w] = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

    if (onProgress && w % progressEvery === 0) {
      onProgress(w / windowCount);
    }
  }

  onProgress?.(1);

  return {
    db,
    windowSec,
    durationSec: samples.length / sampleRate,
  };
}

// Group consecutive quiet windows into silence regions, drop those shorter than
// the minimum duration, then shrink each by the padding to protect speech
// transitions. Cheap enough to run on every slider change.
export function detectSilenceRegions(
  analysis: RmsAnalysis,
  settings: SilenceSettings,
): SilenceRegion[] {
  const { db, windowSec, durationSec } = analysis;
  const regions: SilenceRegion[] = [];

  let runStart = -1;
  for (let w = 0; w < db.length; w++) {
    const quiet = db[w] < settings.thresholdDb;
    if (quiet && runStart === -1) {
      runStart = w;
    } else if (!quiet && runStart !== -1) {
      regions.push({ startSec: runStart * windowSec, endSec: w * windowSec });
      runStart = -1;
    }
  }
  if (runStart !== -1) {
    regions.push({ startSec: runStart * windowSec, endSec: durationSec });
  }

  const result: SilenceRegion[] = [];
  for (const region of regions) {
    if (region.endSec - region.startSec < settings.minSilenceSec) continue;
    const startSec = region.startSec + settings.paddingSec;
    const endSec = region.endSec - settings.paddingSec;
    if (endSec - startSec <= 0) continue;
    result.push({ startSec, endSec });
  }
  return result;
}
