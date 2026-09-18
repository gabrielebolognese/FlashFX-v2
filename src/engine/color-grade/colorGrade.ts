import { bakeCurve1D, sampleCurve1D } from '../../core/effects/curves';
import { sampleLUT, type LUT3D } from '../../core/effects/lut';
import type { GradePreset } from '../../core/effects/gradePresets';

// Color grading (B15) - browser bake. Applies a film-look preset (per-channel + master tone curves +
// saturation) and/or a loaded 3D LUT per pixel on a 2D canvas, blended by intensity. The engine
// (curves + LUT) is pure + harnessed (verify:color-grade); this rasterization is browser-only. The
// live per-layer GPU path (3D-LUT texture sample in IMAGE_SHADER) is B15-gpu.

export interface GradeSettings {
  preset: GradePreset | null;
  lut: LUT3D | null;
  intensity: number; // 0..1
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export async function renderGrade(bitmap: ImageBitmap, s: GradeSettings): Promise<Blob> {
  const w = bitmap.width, h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bitmap, 0, 0);

  const p = s.preset;
  const master = p?.master ? bakeCurve1D(p.master) : null;
  const rC = p?.r ? bakeCurve1D(p.r) : null;
  const gC = p?.g ? bakeCurve1D(p.g) : null;
  const bC = p?.b ? bakeCurve1D(p.b) : null;
  const sat = p?.saturation ?? 1;
  const lut = s.lut;
  const inten = clamp01(s.intensity);
  const hasWork = !!(master || rC || gC || bC || sat !== 1 || lut);
  if (!hasWork || inten <= 0) return canvas.convertToBlob({ type: 'image/png' });

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 1) continue;
    const r0 = d[i] / 255, g0 = d[i + 1] / 255, b0 = d[i + 2] / 255;
    let r = r0, g = g0, b = b0;
    if (rC) r = sampleCurve1D(rC, r);
    if (gC) g = sampleCurve1D(gC, g);
    if (bC) b = sampleCurve1D(bC, b);
    if (master) { r = sampleCurve1D(master, r); g = sampleCurve1D(master, g); b = sampleCurve1D(master, b); }
    if (sat !== 1) {
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      r = clamp01(luma + (r - luma) * sat); g = clamp01(luma + (g - luma) * sat); b = clamp01(luma + (b - luma) * sat);
    }
    if (lut) { const o = sampleLUT(lut, r, g, b); r = o[0]; g = o[1]; b = o[2]; }
    d[i] = (r0 + (r - r0) * inten) * 255;
    d[i + 1] = (g0 + (g - g0) * inten) * 255;
    d[i + 2] = (b0 + (b - b0) * inten) * 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

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
