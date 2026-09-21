import { extractMonoAudio } from '../silence/audioForSilence';
import { detectBeats } from '../../core/beatDetection';
import { frameAmplitude, smoothEnvelope, mapAmplitude, buildAmplitudeTrack, buildBeatTrack, secondsToFrames, type ReactTarget, type Track } from '../../core/audioReactive/audioReactive';

// Audio-reactive - browser glue. Decodes an audio asset to mono samples (extractMonoAudio, the same
// decode beat detection + silence stripping use), runs the pure audio-reactive math (core/audioReactive)
// or the pure beat detector, and returns a keyframe Track for a layer property. The math is harnessed
// (verify:audio-reactive); only the decode is browser-only. The caller writes the keyframes through the
// normal store path, so the result plays + exports frame-purely.

export type ReactMode = 'amplitude' | 'beat';

export interface AudioReactParams {
  mode: ReactMode;
  propertyPath: string;
  target: ReactTarget;
  base: [number, number];
  fps: number;
  frameCount: number;
  min: number;
  max: number;
  // amplitude
  gain: number;
  threshold: number;   // 0..1
  attack: number;      // 0..1 (1 = instant rise)
  release: number;     // 0..1
  // beat
  decayFrames: number;
  sensitivity: number; // detectBeats sensitivity
}

/** Decode `assetId` and build the keyframe track that drives `params.propertyPath`. null if there is
 *  no usable audio. */
export async function generateAudioReactiveTrack(assetId: string, params: AudioReactParams): Promise<Track | null> {
  const mono = await extractMonoAudio(assetId);
  if (!mono || mono.samples.length === 0) return null;
  const frameCount = Math.max(1, Math.round(params.frameCount));

  if (params.mode === 'amplitude') {
    const env = frameAmplitude(mono.samples, mono.sampleRate, params.fps, frameCount);
    const smoothed = smoothEnvelope(env, params.attack, params.release);
    const values = mapAmplitude(smoothed, { min: params.min, max: params.max, gain: params.gain, threshold: params.threshold });
    return buildAmplitudeTrack(values, params.propertyPath, params.target, 0, params.base, 1);
  }

  const { beats } = detectBeats(mono.samples, mono.sampleRate, { sensitivity: params.sensitivity });
  const beatFrames = secondsToFrames(beats, params.fps);
  return buildBeatTrack(beatFrames, params.propertyPath, params.target, { base: params.min, peak: params.max, decayFrames: params.decayFrames }, params.base, frameCount - 1);
}
