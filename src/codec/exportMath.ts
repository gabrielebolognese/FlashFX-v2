// Pure, browser-free math for the MP4 exporter, extracted so the fiddly bits (even-dimension rounding,
// timing validation, keyframe cadence, microsecond timestamps) are unit-testable without WebGPU or
// WebCodecs. See scripts/verify-export-math.mjs.

/** Smallest export dimension we accept. Blocks a blank/0 custom-resolution field from silently
 *  producing a degenerate 2px video (H.264 would round up to 2). */
export const MIN_EXPORT_DIM = 16;

/** H.264 requires even dimensions. Round the requested size DOWN to even. Throws on non-finite or
 *  too-small input (e.g. an empty custom-resolution field parsed as NaN) rather than exporting junk. */
export function normalizeExportDimensions(reqWidth: number, reqHeight: number): { width: number; height: number } {
  if (
    !Number.isFinite(reqWidth) || !Number.isFinite(reqHeight) ||
    reqWidth < MIN_EXPORT_DIM || reqHeight < MIN_EXPORT_DIM
  ) {
    throw new Error(`Invalid export resolution - width and height must be at least ${MIN_EXPORT_DIM} pixels.`);
  }
  return {
    width: Math.max(2, Math.floor(reqWidth / 2) * 2),
    height: Math.max(2, Math.floor(reqHeight / 2) * 2),
  };
}

/** Fail fast + clearly on an empty/invalid composition instead of spinning up the encoder for nothing. */
export function validateExportTiming(totalFrames: number, frameRate: number): void {
  if (!Number.isFinite(totalFrames) || totalFrames <= 0) {
    throw new Error('Nothing to export - the composition has no frames.');
  }
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new Error('Nothing to export - invalid frame rate.');
  }
}

/** Presentation timestamp (microseconds) for a frame index. */
export function frameTimestampUs(frame: number, frameRate: number): number {
  return Math.round((frame * 1_000_000) / frameRate);
}

/** Per-frame duration (microseconds). */
export function frameDurationUs(frameRate: number): number {
  return Math.round(1_000_000 / frameRate);
}

/** Keyframe cadence: one every ~2 seconds (and always frame 0). Rounds the interval to an integer so
 *  a fractional fps (e.g. 29.97) still yields a sane modulus. */
export function isExportKeyframe(frame: number, frameRate: number): boolean {
  const interval = Math.max(1, Math.round(frameRate * 2));
  return frame % interval === 0;
}

/** One source frame the exporter must decode before rendering a composition frame. */
export interface VideoDecodeReq {
  assetId: string;
  frame: number;
}

/** Minimal shape of a resolved layer the decode selector reads (keeps this pure/testable). */
interface ExportDecodeLayer {
  layerType?: string;
  video?: {
    assetId: string;
    sourceFrame: number;
    sourceFrameB?: number;
    blendMix?: number;
  } | null;
}

/**
 * Which source frames must be decoded (full-res) for a resolved composition frame, deduped.
 * Includes the frame-blend / optical-flow B frame (`sourceFrameB`) ONLY when a blend is active
 * (`blendMix` truthy) - matching the renderer's flow-warp gate, so the export decodes exactly what the
 * renderer will sample and no more. Pure so `scripts/verify-export-math.mjs` can assert it.
 */
export function collectExportVideoDecodes(layers: ExportDecodeLayer[]): VideoDecodeReq[] {
  const reqs: VideoDecodeReq[] = [];
  const seen = new Set<string>();
  const add = (assetId: string, frame: number) => {
    const key = `${assetId}:${frame}`;
    if (seen.has(key)) return;
    seen.add(key);
    reqs.push({ assetId, frame });
  };
  for (const layer of layers) {
    if (layer.layerType === 'video' && layer.video) {
      const { assetId, sourceFrame, sourceFrameB, blendMix } = layer.video;
      add(assetId, sourceFrame);
      if (sourceFrameB != null && blendMix) add(assetId, sourceFrameB);
    }
  }
  return reqs;
}
