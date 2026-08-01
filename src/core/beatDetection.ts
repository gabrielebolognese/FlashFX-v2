// Pure, client-side onset/beat + tempo detection.
//
// Energy-flux onset detection (no FFT): frame the mono signal into short hops,
// track the positive change in RMS energy (onset strength), adaptively threshold
// and peak-pick to get onset times, then estimate tempo from the inter-onset
// interval histogram (octave-folded into a musical range). Deterministic and
// dependency-free so it runs in a worker and is provable by scripts/verify-beats.
//
// Not as accurate as a spectral-flux detector, but adequate for placing beat
// markers to cut to music, and it reuses the same energy-envelope idea as
// core/silenceDetection.ts. Upgrading to spectral flux later only needs an FFT.

export interface BeatDetectionResult {
  /** Onset times in seconds. */
  beats: number[];
  /** Estimated tempo in BPM (0 when undetermined). */
  bpm: number;
}

export interface BeatDetectionOptions {
  /** Analysis hop in seconds (envelope resolution). */
  hopSeconds?: number;
  /** Local-mean window (seconds) for the adaptive threshold. */
  windowSeconds?: number;
  /** Threshold = localMean * sensitivity; higher → fewer onsets. */
  sensitivity?: number;
  /** Refractory gap (seconds) between accepted onsets (tempo ceiling). */
  minGapSeconds?: number;
}

const DEFAULTS: Required<BeatDetectionOptions> = {
  hopSeconds: 0.01, // 10 ms
  windowSeconds: 0.2, // 200 ms local-mean window
  sensitivity: 1.5,
  minGapSeconds: 0.12, // ~500 BPM ceiling
};

export function detectBeats(
  samples: Float32Array,
  sampleRate: number,
  options: BeatDetectionOptions = {},
): BeatDetectionResult {
  const opts = { ...DEFAULTS, ...options };
  if (!samples || samples.length === 0 || sampleRate <= 0) return { beats: [], bpm: 0 };

  const hop = Math.max(1, Math.floor(sampleRate * opts.hopSeconds));
  const frameCount = Math.floor(samples.length / hop);
  if (frameCount < 4) return { beats: [], bpm: 0 };

  // 1. Per-hop RMS energy envelope.
  const energy = new Float32Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const start = f * hop;
    const end = Math.min(start + hop, samples.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    energy[f] = Math.sqrt(sum / Math.max(1, end - start));
  }

  // 2. Energy flux: half-wave-rectified first difference (onset strength).
  const flux = new Float32Array(frameCount);
  for (let f = 1; f < frameCount; f++) {
    const d = energy[f] - energy[f - 1];
    flux[f] = d > 0 ? d : 0;
  }

  // 3. Adaptive-threshold peak picking with a refractory gap.
  const win = Math.max(1, Math.round(opts.windowSeconds / opts.hopSeconds));
  const minGapFrames = Math.max(1, Math.round(opts.minGapSeconds / opts.hopSeconds));
  const beats: number[] = [];
  let lastBeatFrame = -Infinity;
  for (let f = 1; f < frameCount - 1; f++) {
    let mean = 0;
    let count = 0;
    const lo = Math.max(0, f - win);
    const hi = Math.min(frameCount - 1, f + win);
    for (let k = lo; k <= hi; k++) {
      mean += flux[k];
      count++;
    }
    mean /= Math.max(1, count);
    const thresh = mean * opts.sensitivity + 1e-6;
    if (flux[f] > thresh && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1] && f - lastBeatFrame >= minGapFrames) {
      beats.push((f * hop) / sampleRate);
      lastBeatFrame = f;
    }
  }

  return { beats, bpm: estimateBpm(beats) };
}

/**
 * Estimate tempo from onset times via an inter-onset-interval vote, octave-folded
 * into [minBpm, maxBpm). Robust to missed/extra onsets by pooling ±2 BPM buckets.
 */
export function estimateBpm(beats: number[], minBpm = 60, maxBpm = 200): number {
  if (beats.length < 4) return 0;
  const votes = new Map<number, number>();
  for (let i = 1; i < beats.length; i++) {
    const ioi = beats[i] - beats[i - 1];
    if (ioi <= 0) continue;
    let bpm = 60 / ioi;
    while (bpm < minBpm) bpm *= 2;
    while (bpm >= maxBpm) bpm /= 2;
    const key = Math.round(bpm);
    votes.set(key, (votes.get(key) ?? 0) + 1);
  }
  let bestBpm = 0;
  let bestScore = -1;
  for (const bpm of votes.keys()) {
    let score = 0;
    for (let d = -2; d <= 2; d++) score += votes.get(bpm + d) ?? 0;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return bestBpm;
}
