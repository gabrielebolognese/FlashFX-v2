import { mediaAssetManager } from '../media/assetManager';
import { encodeWav } from './wavEncoder';

// A pure per-sample channel transform: takes the source channels + sample rate
// and returns the processed channels (same sample rate). Fully client-side.
export type AudioTransform = (channels: Float32Array[], sampleRate: number) => Float32Array[];

function bufferChannels(buffer: AudioBuffer): Float32Array[] {
  const chs: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    // Copy — some transforms return the input unchanged and we must not alias the
    // live decoded buffer when re-encoding.
    chs.push(Float32Array.from(buffer.getChannelData(c)));
  }
  return chs;
}

/**
 * Apply an audio transform to an asset's decoded buffer and import the result as
 * a NEW audio asset (WAV). Returns the new asset id, or null if the source
 * buffer isn't available. Reuses `mediaAssetManager.importAudio` for registration.
 */
export async function processAudioAsset(
  assetId: string,
  projectId: string,
  transform: AudioTransform,
  suffix: string,
): Promise<string | null> {
  const buffer = mediaAssetManager.getAudioBuffer(assetId);
  if (!buffer) return null;
  const out = transform(bufferChannels(buffer), buffer.sampleRate);
  const blob = encodeWav(out, buffer.sampleRate);
  const base = mediaAssetManager.getAsset(assetId)?.name?.replace(/\.[^.]+$/, '') || 'audio';
  const file = new File([blob], `${base}-${suffix}.wav`, { type: 'audio/wav' });
  const { assetId: newId } = await mediaAssetManager.importAudio(file, projectId);
  return newId;
}

// ─── Transforms ───

export const toMono: AudioTransform = (channels) => {
  if (channels.length <= 1) return channels;
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let c = 0; c < channels.length; c++) sum += channels[c][i];
    out[i] = sum / channels.length;
  }
  return [out];
};

export const toStereo: AudioTransform = (channels) => {
  if (channels.length >= 2) return [channels[0], channels[1]];
  if (channels.length === 1) return [channels[0], Float32Array.from(channels[0])];
  return channels;
};

export const normalize: AudioTransform = (channels) => {
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak <= 0 || peak >= 1) return channels; // silent, or already at/over full scale
  const gain = 1 / peak;
  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) out[i] = ch[i] * gain;
    return out;
  });
};

export const amplifyBy = (gain: number): AudioTransform => (channels) =>
  channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) out[i] = Math.max(-1, Math.min(1, ch[i] * gain));
    return out;
  });
