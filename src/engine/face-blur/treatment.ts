import { ellipseMask, coveredRect, blurRadiusPx, pixelBlockPx, featherPx, type FaceBox, type Treatment } from './faceMask';

// Face Blur - pixel treatment (browser 2D canvas). Composites the chosen redaction over each selected
// face on an OffscreenCanvas and returns a PNG blob. Mask geometry + strength come from the pure
// faceMask module (harnessed); this is the browser-only rasterization (not runtime-testable here).

export interface FaceBlurOptions {
  treatment: Treatment;
  strength: number;   // 0..100 (blur radius / pixel block)
  coverage: number;   // 0.5..1.5 (mask size vs the detected box)
  feather: number;    // 0..100 (soft edge; 0 for hard redaction)
  solidColor?: string; // solid mode fill (default black)
  solidOpacity?: number; // 0..1 (default 1 = true redaction)
}

type Ctx = OffscreenCanvasRenderingContext2D;

function ellipsePath(ctx: Ctx, cx: number, cy: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
}

/** Render the source with the given treatment applied to each selected face. Returns a PNG blob. */
export async function renderFaceBlur(bitmap: ImageBitmap, faces: FaceBox[], opts: FaceBlurOptions): Promise<Blob> {
  const w = bitmap.width; const h = bitmap.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.drawImage(bitmap, 0, 0);

  const feather = featherPx(opts.feather, w, h);

  for (const face of faces) {
    const m = ellipseMask(face, w, h, opts.coverage);

    if (opts.treatment === 'solid') {
      // Feathered ellipse fill (no clip; the blur itself makes the soft edge). Default = opaque black.
      const tmp = new OffscreenCanvas(w, h);
      const tctx = tmp.getContext('2d') as Ctx;
      tctx.fillStyle = opts.solidColor ?? '#000000';
      tctx.globalAlpha = opts.solidOpacity ?? 1;
      ellipsePath(tctx, m.cx, m.cy, m.rx, m.ry);
      tctx.fill();
      ctx.save();
      if (feather > 0) ctx.filter = `blur(${feather}px)`;
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
      continue;
    }

    ctx.save();
    ellipsePath(ctx, m.cx, m.cy, m.rx, m.ry);
    ctx.clip();
    if (opts.treatment === 'gaussian') {
      ctx.filter = `blur(${blurRadiusPx(opts.strength, w, h)}px)`;
      ctx.drawImage(bitmap, 0, 0);
      ctx.filter = 'none';
    } else {
      // pixelate: downscale the covered rect then draw it back with nearest-neighbour scaling.
      const block = pixelBlockPx(opts.strength, w, h);
      const rect = coveredRect(face, w, h, opts.coverage);
      const rx = Math.max(0, Math.floor(rect.x)); const ry = Math.max(0, Math.floor(rect.y));
      const rw = Math.min(w - rx, Math.ceil(rect.w)); const rh = Math.min(h - ry, Math.ceil(rect.h));
      if (rw > 0 && rh > 0) {
        const sw = Math.max(1, Math.round(rw / block)); const sh = Math.max(1, Math.round(rh / block));
        const small = new OffscreenCanvas(sw, sh);
        const sctx = small.getContext('2d') as Ctx;
        sctx.drawImage(bitmap, rx, ry, rw, rh, 0, 0, sw, sh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(small, 0, 0, sw, sh, rx, ry, rw, rh);
        ctx.imageSmoothingEnabled = true;
      }
    }
    ctx.restore();
  }

  return canvas.convertToBlob({ type: 'image/png' });
}

/** A small downscaled copy of a bitmap for fast live preview (normalized coords make it look right). */
export async function makePreviewBitmap(bitmap: ImageBitmap, maxSide = 1000): Promise<ImageBitmap> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale >= 1) return bitmap;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return createImageBitmap(canvas);
}
