import { videoDecoderPool } from './videoDecoderPool';
import { mediaAssetManager } from '../media/assetManager';
import { computeColorHistogram, detectCutIndices } from '../../core/sceneDetection';

export interface SceneDetectOptions {
  /** Sample one frame every N seconds (coarser = faster, may miss quick cuts). */
  sampleEverySec?: number;
  /** Cut sensitivity: total-variation histogram distance in [0,1]; lower = more cuts. */
  threshold?: number;
  /** Downscale width for the histogram pass (height derives from aspect). */
  downscaleW?: number;
}

/**
 * Detect hard scene cuts in a video asset by sampling frames, summarizing each as
 * an RGB histogram, and flagging large frame-to-frame changes. Returns cut times
 * in SECONDS (relative to the clip start). Best-effort: needs an active decoder in
 * the pool (the asset must have been loaded for playback), like the thumbnail sheet.
 * Each decoded VideoFrame is closed after sampling so no decoder resources leak.
 */
export async function detectSceneCuts(
  assetId: string,
  opts: SceneDetectOptions = {},
  onProgress?: (progress01: number) => void,
): Promise<number[]> {
  const meta = mediaAssetManager.getMetadata(assetId);
  if (!meta) throw new Error('No metadata for asset');

  const sampleEverySec = opts.sampleEverySec ?? 0.5;
  const threshold = opts.threshold ?? 0.4;
  const dw = opts.downscaleW ?? 64;
  const dh = Math.max(1, Math.round(dw * (meta.height / Math.max(1, meta.width))));
  const totalFrames = Math.max(1, Math.floor(meta.duration * meta.frameRate));
  const step = Math.max(1, Math.round(sampleEverySec * meta.frameRate));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No 2D context');

  const sampledSeconds: number[] = [];
  const histograms: Float32Array[] = [];
  for (let f = 0; f < totalFrames; f += step) {
    try {
      const frame = await videoDecoderPool.decodeFrame(assetId, f);
      try {
        const bmp = await createImageBitmap(frame);
        ctx.drawImage(bmp, 0, 0, dw, dh);
        bmp.close();
        const { data } = ctx.getImageData(0, 0, dw, dh);
        histograms.push(computeColorHistogram(data));
        sampledSeconds.push(f / meta.frameRate);
      } finally {
        frame.close();
      }
    } catch {
      // Skip frames that fail to decode; a gap just widens the compared interval.
    }
    onProgress?.(f / totalFrames);
  }

  return detectCutIndices(histograms, threshold).map((i) => sampledSeconds[i]);
}
