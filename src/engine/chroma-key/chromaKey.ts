import { rgbToYCbCr, chromaKeyAlpha, suppressSpill, chokeMatte, featherMatte, dominantChannel } from '../../core/keying/keying';

// Chroma Key - browser compositor (2D canvas). Builds an alpha matte per pixel via the pure keying
// math (core/keying: YCbCr chroma distance + despill + choke/feather), multiplies it into any existing
// alpha, and bakes a straight-alpha transparent PNG. The keying math is pure + harnessed
// (verify:keying); this rasterization + the eyedropper are browser-only. Apply imports the PNG as a
// new asset + layer (original untouched). The live per-layer GPU keyer is B28-gpu.

export interface KeyOptions {
  keyColor: [number, number, number]; // key colour, 0..255 sRGB
  tolerance: number;                  // 0..1 fully-keyed Cb/Cr radius
  softness: number;                   // 0..1 soft falloff width
  despill: number;                    // 0..1 key-channel spill suppression
  choke: number;                      // 0..100 matte erode (tighten edge)
  feather: number;                    // 0..100 matte blur (soften edge)
}

export const DEFAULT_KEY_OPTIONS: KeyOptions = { keyColor: [0, 177, 64], tolerance: 0.18, softness: 0.12, despill: 0.6, choke: 8, feather: 6 };

function bitmapToImageData(bitmap: ImageBitmap): { ctx: OffscreenCanvasRenderingContext2D; img: ImageData; w: number; h: number } | null {
  const w = bitmap.width, h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  try { return { ctx, img: ctx.getImageData(0, 0, w, h), w, h }; } catch { return null; }
}

/** Slider (0..100) -> pixel radius, scaled by the smaller image dimension so preview and full-res
 *  bake produce matching edges regardless of resolution. 100 ~= 3% of the short side. */
function radiusPx(slider: number, w: number, h: number): number {
  return Math.round((Math.max(0, Math.min(100, slider)) / 100) * 0.03 * Math.min(w, h));
}

/** Key a bitmap and return a straight-alpha transparent PNG blob (original untouched). */
export async function renderChromaKey(bitmap: ImageBitmap, opts: KeyOptions): Promise<Blob> {
  const packed = bitmapToImageData(bitmap);
  if (!packed) throw new Error('2D canvas unavailable');
  const { ctx, img, w, h } = packed;
  const d = img.data;
  const [kr, kg, kb] = opts.keyColor;
  const key = rgbToYCbCr(kr / 255, kg / 255, kb / 255);
  const keyChannel = dominantChannel(kr, kg, kb);

  // Pass 1: build the matte = existing alpha * chroma-key alpha.
  const matte = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const a = d[i + 3] / 255;
    if (a <= 0) { matte[p] = 0; continue; }
    matte[p] = a * chromaKeyAlpha(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, key.cb, key.cr, opts.tolerance, opts.softness);
  }

  // Matte refine: choke (erode) then feather (blur) - AE order.
  const choked = chokeMatte(matte, w, h, radiusPx(opts.choke, w, h));
  const refined = featherMatte(choked, w, h, radiusPx(opts.feather, w, h));

  // Pass 2: despill RGB + write the refined matte into alpha.
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (opts.despill > 0) {
      const s = suppressSpill(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, keyChannel, opts.despill);
      d[i] = Math.round(s.r * 255); d[i + 1] = Math.round(s.g * 255); d[i + 2] = Math.round(s.b * 255);
    }
    d[i + 3] = Math.round(Math.min(1, Math.max(0, refined[p])) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return ctx.canvas.convertToBlob({ type: 'image/png' });
}

/** A downscaled copy for fast live preview (verbatim from imageOps.makePreviewBitmap). */
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

/** Eyedropper: the sRGB colour at normalized (u,v) in the bitmap, 0..255. null if unreadable. */
export function sampleBitmapColor(bitmap: ImageBitmap, u: number, v: number): [number, number, number] | null {
  const packed = bitmapToImageData(bitmap);
  if (!packed) return null;
  const { img, w, h } = packed;
  const x = Math.max(0, Math.min(w - 1, Math.round(u * w)));
  const y = Math.max(0, Math.min(h - 1, Math.round(v * h)));
  const i = (y * w + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
