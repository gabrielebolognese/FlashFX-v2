import { analyzePixels, srgb8ToOklab, oklabToSrgb8, applyTransform, protectionFactor, type LabStats, type Transform } from './colorTransfer';

// Color Match - browser image ops (2D canvas). analyzeBitmap runs ONCE per image and is cached by the
// modal; renderMatch applies a prebuilt transform per pixel. The transfer math is pure + harnessed
// (verify:color-transfer); this rasterization is browser-only (not runtime-testable here).

export interface ProtectOpts { skin: boolean; neutral: boolean; skinAmount?: number; neutralAmount?: number }

function bitmapToImageData(bitmap: ImageBitmap, maxSide?: number): ImageData | null {
  const scale = maxSide ? Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height)) : 1;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  try { return ctx.getImageData(0, 0, w, h); } catch { return null; }
}

/** OKLab mean/std for an image (downscaled analysis copy). */
export function analyzeBitmap(bitmap: ImageBitmap, maxSide = 256): LabStats {
  const img = bitmapToImageData(bitmap, maxSide);
  if (!img) return { L: { mean: 0, std: 0 }, a: { mean: 0, std: 0 }, b: { mean: 0, std: 0 }, count: 0 };
  return analyzePixels(img.data);
}

/** Apply a colour transform to a bitmap per pixel and return a PNG blob. */
export async function renderMatch(bitmap: ImageBitmap, transform: Transform, strength: number, prot: ProtectOpts): Promise<Blob> {
  const w = bitmap.width; const h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const doProtect = prot.skin || prot.neutral;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const lab = srgb8ToOklab(d[i], d[i + 1], d[i + 2]);
    const p = doProtect ? protectionFactor(lab, prot) : 0;
    const out = applyTransform(lab, transform, strength, p);
    const rgb = oklabToSrgb8(out.L, out.a, out.b);
    d[i] = rgb.r; d[i + 1] = rgb.g; d[i + 2] = rgb.b;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

/** A downscaled copy for fast live preview. */
export async function makePreviewBitmap(bitmap: ImageBitmap, maxSide = 900): Promise<ImageBitmap> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale >= 1) return bitmap;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return createImageBitmap(canvas);
}
