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
