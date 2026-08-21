// Pre-flight memory guard for MP4 export.
//
// The export buffers the whole encoded video AND the whole muxed MP4 in RAM
// (exporter.ts: encodedChunks[] + mp4-muxer ArrayBufferTarget with
// fastStart:'in-memory'), so peak memory grows linearly with duration/bitrate and
// long/4K exports can OOM the tab. There is no browser API for free RAM, so this is
// a heuristic: a computed peak-bytes estimate + navigator.deviceMemory (a coarse
// device-class hint). Everything except readDeviceMemoryGB() is PURE and harness-tested.

export interface ExportMemoryInputs {
  width: number;
  height: number;
  frameRate: number;
  durationFrames: number;
  bitrate: number; // bits/sec (QUALITY_PRESETS[q].bitrate)
  includeAudio: boolean;
  hasVideo: boolean; // composition contains a video layer (drives the decoded-frame cache term)
}

// --- Constants, each traced to a source line ---
const AUDIO_SAMPLE_RATE = 48_000; // audioMixer.ts EXPORT_SAMPLE_RATE
const AUDIO_CHANNELS = 2; // audioMixer.ts EXPORT_CHANNELS
const F32 = 4;
const AUDIO_BITRATE = 192_000; // audioMixer.ts AUDIO_BITRATE (bits/sec)
const FRAME_CACHE_BYTES = 512 * 1024 * 1024; // frameScheduler.ts MEMORY_BUDGET_BYTES
const GPU_FRAME_MULT = 8; // offscreen canvas + renderer pools + <=5 in-flight VideoFrames
const FIXED_OVERHEAD = 64 * 1024 * 1024; // muxer + encoder + wasm

/** Encoded video bitstream size — identical to the modal's "Est. Size". */
export function encodedVideoBytes(i: ExportMemoryInputs): number {
  return (i.bitrate * i.durationFrames) / (8 * i.frameRate);
}

/** Largest single contiguous allocation (the in-RAM muxed ArrayBuffer, fastStart:'in-memory').
 *  This term hits Chromium's ~2 GB single-buffer wall. */
export function maxSingleBufferBytes(i: ExportMemoryInputs): number {
  const durationSec = i.durationFrames / i.frameRate;
  const audio = i.includeAudio ? (AUDIO_BITRATE * durationSec) / 8 : 0;
  return encodedVideoBytes(i) + audio;
}

/** Estimated PEAK resident bytes during export. */
export function estimateExportMemoryBytes(i: ExportMemoryInputs): number {
  const durationSec = i.durationFrames / i.frameRate;
  const eVideo = encodedVideoBytes(i);

  // (A) encodedChunks[] + (B) muxed target.buffer coexist + (C) transient Blob copy at peak.
  const videoTerm = 3 * eVideo;

  // (D) OfflineAudioContext stereo f32 PCM + the encoded AAC chunk array.
  const audioTerm = i.includeAudio
    ? AUDIO_CHANNELS * F32 * AUDIO_SAMPLE_RATE * durationSec + (AUDIO_BITRATE * durationSec) / 8
    : 0;

  // (E) frameScheduler decoded-frame cache ceiling (only if the comp has video layers).
  const frameCacheTerm = i.hasVideo ? FRAME_CACHE_BYTES : 0;

  // (F) offscreen canvas + renderer pooled textures + in-flight VideoFrames (~8x W*H*4).
  const gpuTerm = GPU_FRAME_MULT * i.width * i.height * 4;

  return videoTerm + audioTerm + frameCacheTerm + gpuTerm + FIXED_OVERHEAD;
}

export type ExportMemoryVerdict = 'ok' | 'warn' | 'block';

export const EXPORT_MEM_GUARD = {
  DEFAULT_DEVICE_MEMORY_GB: 4, // navigator.deviceMemory undefined (Firefox/Safari/older)
  SINGLE_BUFFER_HARD_BYTES: 2 * 1024 ** 3, // Chromium ~2GB single-ArrayBuffer wall -> hard block
  ABSOLUTE_WARN_BYTES: 1 * 1024 ** 3, // >=1GB peak -> warn regardless of device
  ABSOLUTE_HARD_BYTES: 2.5 * 1024 ** 3, // >=2.5GB peak -> block on any device
  WARN_FRACTION: 0.25, // > 25% of device RAM -> warn
  BLOCK_FRACTION: 0.5, // > 50% of device RAM -> block
} as const;

export interface ExportMemoryReport {
  verdict: ExportMemoryVerdict;
  peakBytes: number;
  singleBufferBytes: number;
  deviceMemoryGB: number;
  reason: string;
}

const gb = (b: number): string => (b / 1024 ** 3).toFixed(1);

/** PURE. deviceMemoryGB is passed in (undefined -> conservative default tier). */
export function classifyExportMemory(
  inputs: ExportMemoryInputs,
  deviceMemoryGB: number | undefined,
): ExportMemoryReport {
  const G = EXPORT_MEM_GUARD;
  const peakBytes = estimateExportMemoryBytes(inputs);
  const singleBufferBytes = maxSingleBufferBytes(inputs);
  const devGB = deviceMemoryGB ?? G.DEFAULT_DEVICE_MEMORY_GB;
  const devBytes = devGB * 1024 ** 3;

  const mk = (verdict: ExportMemoryVerdict, reason: string): ExportMemoryReport => ({
    verdict,
    peakBytes,
    singleBufferBytes,
    deviceMemoryGB: devGB,
    reason,
  });

  // --- HARD BLOCK: physical / Chromium impossibilities first ---
  if (singleBufferBytes >= G.SINGLE_BUFFER_HARD_BYTES)
    return mk('block', `the muxed file alone (~${gb(singleBufferBytes)} GB) exceeds the browser's 2 GB single-buffer limit`);
  if (peakBytes >= G.ABSOLUTE_HARD_BYTES)
    return mk('block', `estimated peak memory (~${gb(peakBytes)} GB) exceeds the safe ceiling`);
  if (peakBytes > devBytes * G.BLOCK_FRACTION)
    return mk('block', `estimated peak (~${gb(peakBytes)} GB) exceeds 50% of this device's ~${devGB} GB RAM`);

  // --- SOFT WARN ---
  if (peakBytes > devBytes * G.WARN_FRACTION || peakBytes > G.ABSOLUTE_WARN_BYTES)
    return mk('warn', `may use ~${gb(peakBytes)} GB of memory`);

  return mk('ok', 'within safe limits');
}

/** IMPURE. The only browser read. deviceMemory is Chromium-only; undefined elsewhere. */
export function readDeviceMemoryGB(): number | undefined {
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
}
