import { mediaAssetManager } from '../media/assetManager';

export interface MonoAudio {
  samples: Float32Array;
  sampleRate: number;
}

async function decodeFromObjectUrl(objectUrl: string): Promise<AudioBuffer> {
  const response = await fetch(objectUrl);
  const arrayBuffer = await response.arrayBuffer();
  const ctx = new AudioContext();
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels === 1) return buffer.getChannelData(0).slice();

  const mono = new Float32Array(length);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i];
  }
  for (let i = 0; i < length; i++) mono[i] /= numberOfChannels;
  return mono;
}

// Wait up to `timeoutMs` for the audio buffer to become available through the
// asset manager (background extraction from video). Polls via the subscribe
// mechanism rather than busy-wait.
function waitForAudioBuffer(assetId: string, timeoutMs: number): Promise<AudioBuffer | null> {
  return new Promise((resolve) => {
    const existing = mediaAssetManager.getAudioBuffer(assetId);
    if (existing) { resolve(existing); return; }

    const timer = setTimeout(() => {
      unsub();
      resolve(null);
    }, timeoutMs);

    const unsub = mediaAssetManager.subscribe(() => {
      const buf = mediaAssetManager.getAudioBuffer(assetId);
      if (buf) {
        clearTimeout(timer);
        unsub();
        resolve(buf);
      }
    });
  });
}

export async function extractMonoAudio(assetId: string): Promise<MonoAudio> {
  // First check if buffer is already available
  let buffer = mediaAssetManager.getAudioBuffer(assetId);

  // If not available, wait briefly for background extraction to complete
  if (!buffer) {
    buffer = await waitForAudioBuffer(assetId, 5000);
  }

  if (buffer) {
    return { samples: downmixToMono(buffer), sampleRate: buffer.sampleRate };
  }

  // Final fallback: decode directly from the object URL
  const objectUrl = mediaAssetManager.getObjectUrl(assetId);
  if (!objectUrl) {
    throw new Error('Could not locate media for silence analysis. The media file may have been removed.');
  }

  try {
    const decoded = await decodeFromObjectUrl(objectUrl);
    if (decoded.length === 0) {
      throw new Error('The selected clip has no audio to analyze.');
    }
    return { samples: downmixToMono(decoded), sampleRate: decoded.sampleRate };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no audio')) throw err;
    throw new Error(
      `Failed to decode audio for silence analysis. The audio format may not be supported by your browser. (${msg})`
    );
  }
}

