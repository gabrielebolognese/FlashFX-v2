import { patternValue, samplePalette } from './patterns';
import { parsePatternConfig } from './config';

// CPU renderer for the generativePattern layer (Phase 1). Mirrors the fieldSampled/particle route:
// draw to an OffscreenCanvas, which the WebGPU renderer uploads as a texture and composites through
// the image pipeline. For performance the per-pixel field is evaluated at reduced resolution and the
// GPU bilinear-upscales it (patterns are smooth, so this is invisible). The pure field math lives in
// patterns.ts and is a 1:1 port target for the future full-res WGSL fragment shader.

const INTERNAL_MAX = 480; // longest edge of the low-res field buffer

interface Entry {
  full: OffscreenCanvas; fullCtx: OffscreenCanvasRenderingContext2D;
  small: OffscreenCanvas; smallCtx: OffscreenCanvasRenderingContext2D;
  w: number; h: number; key: string;
}

class PatternRendererManager {
  private cache = new Map<string, Entry>();

  renderPatternLayer(id: string, configJSON: string, localFrame: number, fps: number, width: number, height: number, knobs?: { scale: number; rotation: number; warp: number; contrast: number }): OffscreenCanvas | null {
    if (width < 2 || height < 2) return null;
    const key = `${configJSON}|${localFrame}|${knobs ? `${knobs.scale},${knobs.rotation},${knobs.warp},${knobs.contrast}` : ''}`;
    let e = this.cache.get(id);
    if (e && e.key === key && e.w === width && e.h === height) return e.full;

    const parsed = parsePatternConfig(configJSON);
    const cfg = knobs ? { ...parsed, scale: knobs.scale, rotationDeg: knobs.rotation, warp: knobs.warp, contrast: knobs.contrast } : parsed;
    const t = localFrame / (fps || 30);
    const aspect = width / height;
    const scale = INTERNAL_MAX / Math.max(width, height);
    const iw = Math.max(2, Math.round(width * Math.min(1, scale)));
    const ih = Math.max(2, Math.round(height * Math.min(1, scale)));

    if (!e || e.w !== width || e.h !== height || e.small.width !== iw || e.small.height !== ih) {
      const full = new OffscreenCanvas(width, height);
      const fullCtx = full.getContext('2d');
      const small = new OffscreenCanvas(iw, ih);
      const smallCtx = small.getContext('2d');
      if (!fullCtx || !smallCtx) return null;
      fullCtx.imageSmoothingEnabled = true;
      e = { full, fullCtx, small, smallCtx, w: width, h: height, key };
      this.cache.set(id, e);
    }

    const img = e.smallCtx.createImageData(iw, ih);
    const data = img.data;
    for (let y = 0; y < ih; y++) {
      const v = (y + 0.5) / ih;
      for (let x = 0; x < iw; x++) {
        const val = patternValue(cfg, (x + 0.5) / iw, v, aspect, t);
        const [r, g, b] = samplePalette(cfg.palette, val, cfg.paletteMode === 'smooth');
        const o = (y * iw + x) * 4;
        data[o] = r * 255; data[o + 1] = g * 255; data[o + 2] = b * 255; data[o + 3] = 255;
      }
    }
    e.smallCtx.putImageData(img, 0, 0);
    e.fullCtx.clearRect(0, 0, width, height);
    e.fullCtx.drawImage(e.small, 0, 0, width, height);
    e.key = key;
    return e.full;
  }

  clear(id: string): void { this.cache.delete(id); }
}

export const patternRenderer = new PatternRendererManager();
