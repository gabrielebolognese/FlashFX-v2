import { mediaAssetManager } from '../media/assetManager';

// Whisper models expect 16 kHz mono PCM in the range [-1, 1].
export const WHISPER_SAMPLE_RATE = 16000;

async function decodeFromObjectUrl(objectUrl: string): Promise<AudioBuffer> {
  const response = await fetch(objectUrl);
  const arrayBuffer = await response.arrayBuffer();
  const ctx = new AudioContext();
  try {
    // decodeAudioData copies the data, so we can release the context afterwards.
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
}

// Downmix to mono and resample to 16 kHz using an offline graph. Returns a fresh
// Float32Array; the source AudioBuffer is not retained by the caller.
async function resampleToMono16k(buffer: AudioBuffer): Promise<Float32Array> {
  if (buffer.sampleRate === WHISPER_SAMPLE_RATE && buffer.numberOfChannels === 1) {
    // Already in the target format — copy the channel out directly.
    return buffer.getChannelData(0).slice();
  }

  const frameCount = Math.max(1, Math.ceil(buffer.duration * WHISPER_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frameCount, WHISPER_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice();
}

// Resolve a 16 kHz mono Float32Array for a video or audio asset. Prefers an
// already-decoded AudioBuffer when the asset manager has one; otherwise decodes
// from the asset's object URL (works for video containers too — the browser
// extracts the audio track). Temporary buffers are not retained.
export async function extractAudioForCaptions(assetId: string): Promise<Float32Array> {
  const existing = mediaAssetManager.getAudioBuffer(assetId);
  if (existing) {
    return resampleToMono16k(existing);
  }

  const objectUrl = mediaAssetManager.getObjectUrl(assetId);
  if (!objectUrl) {
    throw new Error('Could not locate media for caption generation.');
  }

  const decoded = await decodeFromObjectUrl(objectUrl);
  if (decoded.length === 0) {
    throw new Error('The selected clip has no audio to transcribe.');
  }
  return resampleToMono16k(decoded);
}
