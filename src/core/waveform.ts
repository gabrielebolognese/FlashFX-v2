// Pure waveform-peak reduction: turn a mono PCM channel into a fixed number of
// [min, max] buckets for the timeline waveform. Kept dependency-free and testable
// (scripts/verify-waveform) — the asset manager wraps it with the AudioBuffer
// metadata.
//
// A naïve reduction visits EVERY sample (≈28.8M iterations for a 10-min clip),
// which froze the main thread on import. Since each bucket becomes a single
// screen column, reading every sample is wasteful: a strided min/max capped at
// MAX_READS_PER_PEAK samples per bucket produces a visually identical envelope
// for a small fraction of the work (~50× fewer reads on long clips).

export interface WaveformPeaks {
  /** Interleaved [min, max] per bucket — length = peakCount * 2. */
  peaks: Float32Array;
  samplesPerPeak: number;
  peakCount: number;
}

const MAX_READS_PER_PEAK = 256;

export function computeWaveformPeaks(channelData: Float32Array, targetPeaks = 2048): WaveformPeaks {
  const len = channelData.length;
  if (len === 0 || targetPeaks <= 0) {
    return { peaks: new Float32Array(0), samplesPerPeak: 1, peakCount: 0 };
  }
  const samplesPerPeak = Math.max(1, Math.floor(len / targetPeaks));
  const peakCount = Math.ceil(len / samplesPerPeak);
  const peaks = new Float32Array(peakCount * 2);
  // Stride so each bucket reads at most MAX_READS_PER_PEAK samples.
  const step = Math.max(1, Math.floor(samplesPerPeak / MAX_READS_PER_PEAK));

  for (let i = 0; i < peakCount; i++) {
    let min = 1;
    let max = -1;
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, len);
    for (let j = start; j < end; j += step) {
      const v = channelData[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // Guard the (impossible) empty bucket so we never emit min > max.
    if (min > max) { min = 0; max = 0; }
    peaks[i * 2] = min;
    peaks[i * 2 + 1] = max;
  }

  return { peaks, samplesPerPeak, peakCount };
}
