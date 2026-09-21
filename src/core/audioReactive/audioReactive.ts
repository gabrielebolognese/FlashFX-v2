// Audio-reactive keyframe generation (B31) - pure signal-to-animation math (leaf module, no imports, so
// esbuild bundles it standalone). Turns decoded audio into ordinary keyframes that drive a layer
// property: a per-frame RMS amplitude envelope (with attack/release smoothing and a mapping curve), and
// beat-synced pulses (from the existing detectBeats, whose beat times in seconds this module places on
// frames). The output is plain keyframes flowing through the normal interpolation/playback system, so it
// renders and exports frame-purely - only the audio DECODE (extractMonoAudio) and beat detection run in
// the browser. Deterministic; unit-tested by scripts/verify-audio-reactive.mjs.

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** How a scalar drives the target property. Scale is uniform (both axes); position drives one axis. */
export type ReactTarget = 'number' | 'vec2-uniform' | 'vec2-x' | 'vec2-y';

export interface Track {
  propertyPath: string;
  keyframes: { frame: number; value: number | [number, number] }[];
}

function toValue(v: number, target: ReactTarget, base: [number, number]): number | [number, number] {
  if (target === 'number') return v;
  if (target === 'vec2-uniform') return [v, v];
  if (target === 'vec2-x') return [v, base[1]];
  return [base[0], v]; // vec2-y
}

export interface AmplitudeOptions { windowSec?: number; normalize?: boolean }

/**
 * Per-frame RMS amplitude of mono `samples`, one value per frame at `fps`. Each frame samples an RMS
 * window (default 50ms) centred on its time. Normalised to a 0..1 peak by default (silence -> all 0).
 */
export function frameAmplitude(samples: Float32Array, sampleRate: number, fps: number, frameCount: number, opts: AmplitudeOptions = {}): Float32Array {
  const windowSec = opts.windowSec ?? 0.05;
  const half = Math.max(1, Math.round((windowSec * sampleRate) / 2));
  const out = new Float32Array(Math.max(0, frameCount));
  let peak = 0;
  for (let f = 0; f < frameCount; f++) {
    const center = Math.round((f / fps) * sampleRate);
    let lo = center - half, hi = center + half;
    if (lo < 0) lo = 0;
    if (hi > samples.length) hi = samples.length;
    let sum = 0, n = 0;
    for (let i = lo; i < hi; i++) { const s = samples[i]; sum += s * s; n++; }
    const rms = n > 0 ? Math.sqrt(sum / n) : 0;
    out[f] = rms;
    if (rms > peak) peak = rms;
  }
  if ((opts.normalize ?? true) && peak > 1e-6) for (let f = 0; f < out.length; f++) out[f] /= peak;
  return out;
}

/**
 * Asymmetric one-pole smoothing of an envelope: `attack`/`release` are per-frame lerp coefficients
 * (0 = frozen, 1 = instant). A fast attack + slow release makes a value snap up on a hit and ease down.
 * attack === release === 1 is identity.
 */
export function smoothEnvelope(env: Float32Array, attack = 1, release = 1): Float32Array {
  const a = clamp01(attack), r = clamp01(release);
  const n = env.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  out[0] = env[0];
  for (let i = 1; i < n; i++) {
    const prev = out[i - 1], target = env[i];
    out[i] = prev + (target - prev) * (target > prev ? a : r);
  }
  return out;
}

export interface MapOptions { min: number; max: number; gain?: number; threshold?: number; exponent?: number }

/** Map a 0..1 envelope to values in [min,max]: gate below `threshold`, apply `gain`, shape by
 *  `exponent`, then lerp. Monotonic in amplitude. */
export function mapAmplitude(env: Float32Array, opts: MapOptions): Float32Array {
  const gain = opts.gain ?? 1, threshold = clamp01(opts.threshold ?? 0), exponent = opts.exponent ?? 1;
  const denom = Math.max(1e-6, 1 - threshold);
  const out = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) {
    let a = clamp01(((env[i] - threshold) / denom) * gain);
    if (exponent !== 1) a = Math.pow(a, exponent);
    out[i] = opts.min + (opts.max - opts.min) * a;
  }
  return out;
}

/** Turn a per-frame value series into a keyframe track (one keyframe every `stride` frames + the last). */
export function buildAmplitudeTrack(values: Float32Array, propertyPath: string, target: ReactTarget, startFrame: number, base: [number, number] = [0, 0], stride = 1): Track {
  const s = Math.max(1, Math.round(stride));
  const keyframes: Track['keyframes'] = [];
  for (let f = 0; f < values.length; f += s) keyframes.push({ frame: startFrame + f, value: toValue(values[f], target, base) });
  const last = values.length - 1;
  if (last >= 0 && last % s !== 0) keyframes.push({ frame: startFrame + last, value: toValue(values[last], target, base) });
  return { propertyPath, keyframes };
}

/** Convert times (seconds) to integer frame numbers at `fps`. */
export function secondsToFrames(times: number[], fps: number): number[] {
  return times.map((t) => Math.round(t * fps));
}

export interface BeatOptions { base: number; peak: number; decayFrames: number }

/**
 * Beat-pulse keyframes: hold `base`, spike to `peak` on each beat frame, decay back to `base` over
 * `decayFrames`. On a frame collision the higher value wins (a beat is never cancelled by a prior
 * decay). Frames are clamped to [0, endFrame] when `endFrame` is given.
 */
export function buildBeatTrack(beatFrames: number[], propertyPath: string, target: ReactTarget, opts: BeatOptions, base: [number, number] = [0, 0], endFrame?: number): Track {
  const decay = Math.max(1, Math.round(opts.decayFrames));
  const byFrame = new Map<number, number>();
  const put = (frame: number, value: number) => {
    if (endFrame !== undefined && (frame < 0 || frame > endFrame)) return;
    const prev = byFrame.get(frame);
    if (prev === undefined || value > prev) byFrame.set(frame, value);
  };
  put(0, opts.base);
  for (const bf of beatFrames) { const f = Math.round(bf); put(f, opts.peak); put(f + decay, opts.base); }
  if (endFrame !== undefined) put(endFrame, opts.base);
  const frames = [...byFrame.keys()].sort((p, q) => p - q);
  return { propertyPath, keyframes: frames.map((frame) => ({ frame, value: toValue(byFrame.get(frame) as number, target, base) })) };
}
