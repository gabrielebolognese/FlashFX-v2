import { mediaAssetManager } from '../media/assetManager';
import { WHISPER_SAMPLE_RATE } from './audioExtraction';

// Extract just the PLAYED region of an audio (or video) clip as 16 kHz mono Float32 — Whisper's
// native input (no 16-bit PCM WAV step needed; a WAV would only be decoded back to this).
//
// Unlike extractAudioForCaptions (which decodes the whole source asset from t=0 and so misaligns
// trimmed clips), this slices the clip's window and resamples in ONE OfflineAudioContext graph:
//   - source.start(0, startSec, spanSec) renders exactly [startSec, startSec+spanSec) of the source,
//   - the 1-channel destination downmixes stereo → mono,
//   - the 16 kHz context resamples from the native rate (44.1/48 kHz).
// The returned buffer begins at the clip's played start (t=0), so transcript timestamps are
// clip-local and the caller only needs to add the clip's timeline in-point to place them globally.
export async function extractClipAudioForCaptions(
  assetId: string,
  startSec: number,
  spanSec: number,
): Promise<Float32Array> {
  const buffer = await mediaAssetManager.ensureAudioBuffer(assetId);
  if (!buffer || buffer.length === 0) {
    throw new Error('The selected clip has no audio to transcribe.');
  }

  const clampedStart = Math.max(0, Math.min(startSec, buffer.duration));
  const clampedSpan = Math.max(0, Math.min(spanSec, buffer.duration - clampedStart));
  if (clampedSpan <= 0) {
    throw new Error('The selected clip has no audio in its played range.');
  }

  const frameCount = Math.max(1, Math.ceil(clampedSpan * WHISPER_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frameCount, WHISPER_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0, clampedStart, clampedSpan);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}
