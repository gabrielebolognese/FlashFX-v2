import type { Composition, AnimatableProperty } from '../core/types';
import { evaluateNumber } from '../core/interpolation';
import { mediaAssetManager } from '../engine/media/assetManager';

// Export audio target. mp4 needs AAC; 48 kHz stereo is the standard. Source
// AudioBuffers at other rates/channel counts are resampled/up-mixed by the
// OfflineAudioContext automatically.
const EXPORT_SAMPLE_RATE = 48000;
const EXPORT_CHANNELS = 2;
const AUDIO_BITRATE = 192_000;
const AAC_CODEC = 'mp4a.40.2'; // AAC-LC

export interface EncodedAudio {
  chunks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[];
  sampleRate: number;
  numberOfChannels: number;
}

/**
 * A single audible clip resolved to Web Audio scheduling parameters. This is the
 * pure, testable core of the mixer — it mirrors the preview scheduling math in
 * engine/media/audioPlayback.ts so exported audio matches what you hear.
 */
interface AudibleSource {
  buffer: AudioBuffer;
  when: number;         // context start time (s) = inPoint / frameRate
  bufferOffset: number; // offset into the source buffer (s)
  clipDuration: number; // clip length on the timeline (s)
  playbackRate: number; // pitch (audio) or speed (video)
  // Gain is either a constant (video) or sampled from keyframes (audio).
  constantGain?: number;
  volumeProp?: AnimatableProperty;
  inPoint: number;      // frames — for keyframe sampling
  outPoint: number;     // frames
}

function clampVolume(v: number): number {
  return Math.max(0, Math.min(2, v));
}

function clampRate(r: number): number {
  return Math.max(0.25, Math.min(4, r));
}

function mutedTrackSet(composition: Composition): Set<string> {
  const tracks = composition.tracks || [];
  return new Set(tracks.filter((t) => t.muted || !t.visible).map((t) => t.id));
}

/**
 * Cheap predicate for the export UI: does the composition contain anything
 * audible? (A non-muted audio layer, or a non-muted video layer whose asset has
 * a decoded audio track.) The mixer itself makes the final decision.
 */
export function compositionHasAudio(composition: Composition): boolean {
  const muted = mutedTrackSet(composition);
  return composition.layers.some((layer) => {
    if (!layer.visible) return false;
    if (layer.trackId && muted.has(layer.trackId)) return false;
    if (layer.type === 'audio') return !layer.audio.muted;
    if (layer.type === 'video') {
      return !layer.video.muted && !!mediaAssetManager.getAudioBuffer(layer.video.assetId);
    }
    return false;
  });
}

/**
 * Resolve every audible clip in the composition to scheduling parameters. Skips
 * layers with no decoded buffer, no audible range, or an offset past the buffer.
 * Mirrors the filters in audioPlayback.evaluateAndSchedule.
 */
function collectSources(composition: Composition, frameRate: number): AudibleSource[] {
  const muted = mutedTrackSet(composition);
  const sources: AudibleSource[] = [];

  for (const layer of composition.layers) {
    if (!layer.visible) continue;
    if (layer.trackId && muted.has(layer.trackId)) continue;

    const clipDuration = (layer.outPoint - layer.inPoint) / frameRate;
    if (clipDuration <= 0) continue;
    const when = layer.inPoint / frameRate;

    if (layer.type === 'audio' && !layer.audio.muted) {
      const buffer = mediaAssetManager.getAudioBuffer(layer.audio.assetId);
      if (!buffer) continue;
      const bufferOffset = Math.max(0, (layer.audio.startOffset ?? 0) / frameRate);
      if (bufferOffset >= buffer.duration) continue;
      // Pitch is evaluated once at clip start, matching the preview (which sets a
      // constant playbackRate per clip rather than automating it).
      const pitch = evaluateNumber(layer.audio.pitch, layer.inPoint);
      sources.push({
        buffer,
        when,
        bufferOffset,
        clipDuration,
        playbackRate: clampRate(Math.pow(2, pitch / 12)),
        volumeProp: layer.audio.volume,
        inPoint: layer.inPoint,
        outPoint: layer.outPoint,
      });
    } else if (layer.type === 'video' && !layer.video.muted) {
      const buffer = mediaAssetManager.getAudioBuffer(layer.video.assetId);
      if (!buffer) continue;
      // Video source offset is expressed against the source's own frame rate.
      const bufferOffset = Math.max(0, (layer.video.startOffset ?? 0) / layer.video.sourceFrameRate);
      if (bufferOffset >= buffer.duration) continue;
      sources.push({
        buffer,
        when,
        bufferOffset,
        clipDuration,
        playbackRate: clampRate(layer.video.playbackRate || 1),
        constantGain: 1.0, // video audio has no keyframeable volume (muted/unmuted only)
        inPoint: layer.inPoint,
        outPoint: layer.outPoint,
      });
    }
  }

  return sources;
}

/**
 * Program a gain node for one source. Constant for video; for keyframed audio
 * volume, sample per frame across the clip and ramp between values.
 */
function applyGain(gainParam: AudioParam, src: AudibleSource, frameRate: number): void {
  if (src.constantGain !== undefined) {
    gainParam.setValueAtTime(src.constantGain, src.when);
    return;
  }
  const prop = src.volumeProp!;
  const startValue = clampVolume(evaluateNumber(prop, src.inPoint));
  gainParam.setValueAtTime(startValue, src.when);

  // Static volume (0/1 keyframes) needs no automation curve.
  if (!prop.keyframes || prop.keyframes.length <= 1) return;

  for (let f = src.inPoint + 1; f < src.outPoint; f++) {
    gainParam.linearRampToValueAtTime(clampVolume(evaluateNumber(prop, f)), f / frameRate);
  }
}

/**
 * Render all audible clips to a single stereo mix via OfflineAudioContext, then
 * encode to AAC. Returns null when there's nothing to mix or AAC encoding isn't
 * available (caller falls back to a video-only export).
 */
export async function exportCompositionAudio(
  composition: Composition,
  opts: { frameRate: number; durationFrames: number },
  signal?: AbortSignal
): Promise<EncodedAudio | null> {
  const { frameRate, durationFrames } = opts;
  const durationSec = durationFrames / frameRate;
  if (durationSec <= 0) return null;

  const sources = collectSources(composition, frameRate);
  if (sources.length === 0) return null;

  if (signal?.aborted) throw new Error('Export cancelled');

  const length = Math.ceil(durationSec * EXPORT_SAMPLE_RATE);
  const ctx = new OfflineAudioContext(EXPORT_CHANNELS, length, EXPORT_SAMPLE_RATE);

  // Master bus with a gentle limiter so summed overlapping clips can't clip hard.
  const master = ctx.createGain();
  master.gain.value = 1.0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  for (const src of sources) {
    const node = ctx.createBufferSource();
    node.buffer = src.buffer;
    node.playbackRate.value = src.playbackRate;

    const gain = ctx.createGain();
    applyGain(gain.gain, src, frameRate);

    node.connect(gain);
    gain.connect(master);

    // start()/stop() in context time bound the clip exactly, independent of
    // playbackRate — no reliance on the ambiguous start() duration argument.
    node.start(src.when, src.bufferOffset);
    node.stop(src.when + src.clipDuration);
  }

  const mix = await ctx.startRendering();

  if (signal?.aborted) throw new Error('Export cancelled');

  return encodeToAac(mix, signal);
}

/** Encode a rendered stereo mix to AAC via WebCodecs. Null if AAC is unavailable. */
async function encodeToAac(mix: AudioBuffer, signal?: AbortSignal): Promise<EncodedAudio | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') return null;

  const sampleRate = mix.sampleRate;
  const numberOfChannels = Math.min(mix.numberOfChannels, EXPORT_CHANNELS);
  const config: AudioEncoderConfig = {
    codec: AAC_CODEC,
    sampleRate,
    numberOfChannels,
    bitrate: AUDIO_BITRATE,
  };

  try {
    const support = await AudioEncoder.isConfigSupported(config);
    if (!support.supported) return null;
  } catch {
    return null;
  }

  const chunks: EncodedAudio['chunks'] = [];
  let encodeError: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => chunks.push({ chunk, meta: meta ?? undefined }),
    error: (e) => {
      encodeError = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure(config);

  const total = mix.length;
  const ch0 = mix.getChannelData(0);
  const ch1 = numberOfChannels > 1 ? mix.getChannelData(1) : ch0;
  const FRAMES_PER_CHUNK = 1024;

  for (let i = 0; i < total; i += FRAMES_PER_CHUNK) {
    if (signal?.aborted) {
      encoder.close();
      throw new Error('Export cancelled');
    }
    if (encodeError) {
      encoder.close();
      throw encodeError;
    }

    const n = Math.min(FRAMES_PER_CHUNK, total - i);
    // f32-planar layout: [ch0 frames..., ch1 frames...].
    const data = new Float32Array(n * numberOfChannels);
    data.set(ch0.subarray(i, i + n), 0);
    if (numberOfChannels > 1) data.set(ch1.subarray(i, i + n), n);

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: n,
      numberOfChannels,
      timestamp: Math.round((i / sampleRate) * 1_000_000),
      data,
    });
    encoder.encode(audioData);
    audioData.close();
  }

  await encoder.flush();
  encoder.close();
  if (encodeError) throw encodeError;
  if (chunks.length === 0) return null;

  return { chunks, sampleRate, numberOfChannels };
}
