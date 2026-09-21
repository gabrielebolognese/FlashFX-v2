import { boxBlur1, surfaceBlur1, ellipseMaskField } from '../../core/cleanup/cleanup';
import { ellipseMask, type FaceBox } from '../face-blur/faceMask';

// Retouch - browser compositor (2D canvas) for denoise + skin/beauty smoothing on a still image. Builds
// per-channel float buffers, edge-preserving surface-blurs them (keeps real edges), preserves pore
// texture via frequency separation, and optionally limits skin smoothing to detected face regions. The
// cleanup math is pure + harnessed (verify:cleanup); this rasterization + the browser FaceDetector are
// browser-only. Apply bakes a new PNG asset + layer (original untouched). Temporal deflicker (video) is
// B29-video. The live per-layer GPU path is B29-gpu.

export interface RetouchOptions {
  denoise: number; // 0..100 noise reduction strength (global, tight edge-preserving blur)
  smooth: number;  // 0..100 skin smoothing strength
  detail: number;  // 0..100 pore/texture keep (100 = keep all)
  radius: number;  // 0..100 smoothing radius (scaled to image size)
  faces: FaceBox[] | null; // limit skin smoothing to these regions (null = whole image)
}

export const DEFAULT_RETOUCH_OPTIONS: RetouchOptions = { denoise: 40, smooth: 55, detail: 60, radius: 45, faces: null };

const DENOISE_THRESHOLD = 0.06; // tight: only averages near-identical neighbours (kills fine noise)
const SMOOTH_THRESHOLD = 0.10;  // wider: smooths skin tone while keeping strong features
const FACE_COVERAGE = 1.25;     // grow the ellipse past the detected box (hair/jaw/neck)
const FACE_FEATHER = 0.35;      // soft mask edge

function radiusPx(slider: number, w: number, h: number): number {
  return Math.round((Math.max(0, Math.min(100, slider)) / 100) * 0.03 * Math.min(w, h));
}

/** Union of soft face-ellipse masks in source pixels, or null when there are no faces. */
function faceMaskField(faces: FaceBox[] | null, w: number, h: number): Float32Array | null {
  if (!faces || faces.length === 0) return null;
  const field = new Float32Array(w * h);
  for (const box of faces) {
    const e = ellipseMask(box, w, h, FACE_COVERAGE);
    const m = ellipseMaskField(e.cx, e.cy, e.rx, e.ry, w, h, FACE_FEATHER);
    for (let i = 0; i < field.length; i++) if (m[i] > field[i]) field[i] = m[i];
  }
  return field;
}

function bitmapToImageData(bitmap: ImageBitmap): { ctx: OffscreenCanvasRenderingContext2D; img: ImageData; w: number; h: number } | null {
  const w = bitmap.width, h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0);
  try { return { ctx, img: ctx.getImageData(0, 0, w, h), w, h }; } catch { return null; }
}

/** Process one channel: global denoise, then face-limited edge-preserving skin smooth with texture kept. */
function processChannel(ch: Float32Array, w: number, h: number, opts: RetouchOptions, denoiseR: number, smoothR: number, mask: Float32Array | null): Float32Array {
  const dn = Math.max(0, Math.min(1, opts.denoise / 100));
  const sm = Math.max(0, Math.min(1, opts.smooth / 100));
  const detail = Math.max(0, Math.min(1, opts.detail / 100));
  const n = ch.length;

  // Global denoise.
  let den = ch;
  if (dn > 0 && denoiseR > 0) {
    const d = surfaceBlur1(ch, w, h, denoiseR, DENOISE_THRESHOLD);
    den = new Float32Array(n);
    for (let i = 0; i < n; i++) den[i] = ch[i] + (d[i] - ch[i]) * dn;
  }
  if (sm <= 0 || smoothR <= 0) return den;

  // Skin smooth: edge-preserving tone + kept high-frequency texture (frequency separation).
  const base = surfaceBlur1(den, w, h, smoothR, SMOOTH_THRESHOLD);
  const low = boxBlur1(den, w, h, smoothR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const detailBand = den[i] - low[i];
    const recon = base[i] + detailBand * detail;     // smoothed tone + kept pores
    const smoothed = den[i] + (recon - den[i]) * sm; // blend by strength
    const m = mask ? mask[i] : 1;                     // limit to faces if masked
    out[i] = den[i] + (smoothed - den[i]) * m;
  }
  return out;
}

/** Denoise + skin retouch a bitmap and return an opaque PNG blob (original untouched). */
export async function renderRetouch(bitmap: ImageBitmap, opts: RetouchOptions): Promise<Blob> {
  const packed = bitmapToImageData(bitmap);
  if (!packed) throw new Error('2D canvas unavailable');
  const { ctx, img, w, h } = packed;
  const d = img.data;
  const n = w * h;
  const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) { r[p] = d[i] / 255; g[p] = d[i + 1] / 255; b[p] = d[i + 2] / 255; }

  const smoothR = radiusPx(opts.radius, w, h);
  const denoiseR = Math.max(1, Math.round(smoothR * 0.5));
  const mask = faceMaskField(opts.faces, w, h);

  const ro = processChannel(r, w, h, opts, denoiseR, smoothR, mask);
  const go = processChannel(g, w, h, opts, denoiseR, smoothR, mask);
  const bo = processChannel(b, w, h, opts, denoiseR, smoothR, mask);

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    d[i] = Math.round(Math.min(1, Math.max(0, ro[p])) * 255);
    d[i + 1] = Math.round(Math.min(1, Math.max(0, go[p])) * 255);
    d[i + 2] = Math.round(Math.min(1, Math.max(0, bo[p])) * 255);
    // alpha (d[i+3]) preserved
  }
  ctx.putImageData(img, 0, 0);
  return ctx.canvas.convertToBlob({ type: 'image/png' });
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
