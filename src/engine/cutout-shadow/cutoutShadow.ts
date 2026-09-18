import { alphaBounds, contactCenterX, dropShadowOffset, groundShadowParams, softnessBlurPx } from './shadowGeometry';

// Cutout + Shadow - browser compositor. REUSES the Background Removal engine (@imgly) to get the
// subject cutout + alpha mask (no second segmentation model - improvements to bg removal propagate
// here for free), then draws a ground or drop shadow derived from the mask under the subject. The
// geometry is pure + harnessed (verify:shadow-geometry); this canvas work is browser-only.

export interface Cutout { cutout: ImageBitmap; alpha: Uint8ClampedArray; w: number; h: number }
export type ShadowType = 'ground' | 'drop';
export interface ShadowOptions {
  type: ShadowType;
  direction: number;  // 0..100
  distance: number;   // 0..100
  softness: number;   // 0..100
  opacity: number;    // 0..1
  color: string;      // shadow colour (default black)
  background: string; // 'transparent' or a hex colour behind the composite
}

type ProgressCb = (key: string, current: number, total: number) => void;

/** Run Background Removal on the image and return the subject cutout + its alpha mask. */
export async function extractCutout(sourceUrl: string, onProgress?: ProgressCb): Promise<Cutout> {
  const { removeBackground } = await import('@imgly/background-removal');
  const blob = await removeBackground(sourceUrl, onProgress ? { progress: onProgress } : undefined);
  const cutout = await createImageBitmap(blob);
  return { ...alphaOf(cutout), cutout };
}

function alphaOf(bitmap: ImageBitmap): { alpha: Uint8ClampedArray; w: number; h: number } {
  const w = bitmap.width, h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
  return { alpha, w, h };
}

/** A smaller cutout (+ recomputed alpha) for fast live preview. */
export async function downscaleCutout(c: Cutout, maxSide = 900): Promise<Cutout> {
  const scale = Math.min(1, maxSide / Math.max(c.w, c.h));
  if (scale >= 1) return c;
  const w = Math.max(1, Math.round(c.w * scale)); const h = Math.max(1, Math.round(c.h * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(c.cutout, 0, 0, w, h);
  const cutout = await createImageBitmap(canvas);
  return { cutout, ...alphaOf(cutout) };
}

/** A silhouette canvas: the cutout recoloured to `color`, alpha preserved (for the shadow). */
function silhouette(c: Cutout, color: string): OffscreenCanvas {
  const canvas = new OffscreenCanvas(c.w, c.h);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  ctx.drawImage(c.cutout, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.w, c.h);
  return canvas;
}

/** Composite background + shadow + subject cutout into a PNG blob. */
export async function renderCutoutShadow(c: Cutout, opts: ShadowOptions): Promise<Blob> {
  const { w, h } = c;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  if (opts.background !== 'transparent') { ctx.fillStyle = opts.background; ctx.fillRect(0, 0, w, h); }

  const bounds = alphaBounds(c.alpha, w, h);
  if (bounds.found && opts.opacity > 0) {
    const silh = silhouette(c, opts.color);
    const blur = softnessBlurPx(opts.softness, w, h);
    ctx.save();
    ctx.globalAlpha = opts.opacity;
    if (blur > 0) ctx.filter = `blur(${blur}px)`;
    if (opts.type === 'ground') {
      const cx = contactCenterX(c.alpha, w, h, bounds);
      const g = groundShadowParams(bounds, cx, opts.direction, opts.distance);
      ctx.translate(g.pivotX, g.pivotY);
      ctx.transform(1, 0, g.shearX, g.scaleY, 0, 0);
      ctx.translate(-g.pivotX, -g.pivotY);
      ctx.drawImage(silh, 0, 0);
    } else {
      const { dx, dy } = dropShadowOffset(opts.direction, opts.distance, w, h);
      ctx.translate(dx, dy);
      ctx.drawImage(silh, 0, 0);
    }
    ctx.restore();
  }

  // Subject on top.
  ctx.drawImage(c.cutout, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}
