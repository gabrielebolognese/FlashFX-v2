// Footage cleanup & beauty math (B29) - pure signal/image science (leaf module, no imports, so esbuild
// bundles it standalone like keying.ts). Edge-preserving surface blur (denoise / skin smooth that keeps
// real edges), a plain separable box blur, frequency separation (split tone from texture so retouch can
// smooth the tone while keeping pores), temporal deflicker gains (per-frame luma -> correcting gain),
// and a soft ellipse mask field (face-limited retouch). Everything is a deterministic pure function of
// its inputs (no Math.random / Date), unit-tested by scripts/verify-cleanup.mjs. The per-pixel bake, the
// browser FaceDetector, and video frame extraction (deflicker apply) are browser-only (B29-video); this
// file is the shared, provable core the Retouch image tool and any future keyer build on.

/** Smoothstep: 0 below edge0, 1 above edge1, a smooth Hermite ramp between. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Separable box blur of one scalar channel (edges clamped/replicated so energy is ~preserved).
 *  `radius === 0` is identity. Returns a NEW Float32Array (input untouched). */
export function boxBlur1(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.round(Math.abs(radius));
  if (r === 0 || w <= 0 || h <= 0) return new Float32Array(src);
  const win = 2 * r + 1;
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dx = -r; dx <= r; dx++) { let xx = x + dx; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1; s += src[row + xx]; }
      tmp[row + x] = s / win;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -r; dy <= r; dy++) { let yy = y + dy; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1; s += tmp[yy * w + x]; }
      out[y * w + x] = s / win;
    }
  }
  return out;
}

/**
 * Edge-preserving surface blur of one scalar channel: each pixel is the average of only the neighbours
 * within `threshold` of it, so flat/noisy areas smooth out while real edges (a jump larger than the
 * threshold) stay crisp. This is the denoise / skin-smooth primitive (a simplified bilateral). `radius`
 * or `threshold` of 0 is identity. Returns a NEW Float32Array (input untouched).
 */
export function surfaceBlur1(src: Float32Array, w: number, h: number, radius: number, threshold: number): Float32Array {
  const r = Math.round(Math.abs(radius));
  if (r === 0 || threshold <= 0 || w <= 0 || h <= 0) return new Float32Array(src);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = src[y * w + x];
      let sum = 0, cnt = 0;
      const yl = Math.max(0, y - r), yh = Math.min(h - 1, y + r);
      const xl = Math.max(0, x - r), xh = Math.min(w - 1, x + r);
      for (let yy = yl; yy <= yh; yy++) {
        const row = yy * w;
        for (let xx = xl; xx <= xh; xx++) {
          const v = src[row + xx];
          if (Math.abs(v - c) <= threshold) { sum += v; cnt++; }
        }
      }
      out[y * w + x] = cnt > 0 ? sum / cnt : c;
    }
  }
  return out;
}

export interface FreqBands { low: Float32Array; high: Float32Array }

/** Frequency separation of one scalar channel: low = blurred tone, high = src - low (fine texture).
 *  recombine(low, high, 1) reconstructs src exactly (lossless). */
export function frequencySeparate(src: Float32Array, w: number, h: number, radius: number): FreqBands {
  const low = boxBlur1(src, w, h, radius);
  const high = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) high[i] = src[i] - low[i];
  return { low, high };
}

/** Recombine frequency bands: low + high * detailGain. detailGain 1 = original, <1 = softer (less
 *  texture), >1 = sharper. Returns a NEW Float32Array. */
export function recombine(low: Float32Array, high: Float32Array, detailGain: number): Float32Array {
  const out = new Float32Array(low.length);
  for (let i = 0; i < low.length; i++) out[i] = low[i] + high[i] * detailGain;
  return out;
}

/** Centered moving average of a 1-D series (odd window; ends clamped). Returns a NEW array. */
export function movingAverage(vals: number[], window: number): number[] {
  const n = vals.length;
  if (n === 0) return [];
  const half = Math.max(0, Math.floor(window / 2));
  const out: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let j = i - half; j <= i + half; j++) { const k = j < 0 ? 0 : j >= n ? n - 1 : j; s += vals[k]; c++; }
    out[i] = s / c;
  }
  return out;
}

/**
 * Deflicker gains: per frame, the multiplicative luma correction that pulls a flickering brightness
 * series onto its smoothed (moving-average) trend. `strength` 0 = no correction (all 1), 1 = full
 * correction to the trend. Multiply each frame's pixels by its gain to cancel the flicker while keeping
 * the intended slow exposure change. Pure + node-verifiable; the per-frame luma[] comes from a browser
 * video-decode pass (B29-video). Returns one gain per frame.
 */
export function deflickerGains(luma: number[], window: number, strength: number): number[] {
  const ma = movingAverage(luma, window);
  const s = Math.min(1, Math.max(0, strength));
  return luma.map((l, i) => (l > 1e-4 ? 1 + s * (ma[i] / l - 1) : 1));
}

/**
 * Soft ellipse mask field, 1 at the centre falling to 0 outside the ellipse over a feather band
 * (`feather` 0..1 of the radius). Used to limit skin retouch to a detected face region. cx/cy/rx/ry are
 * in pixels. Returns a Float32Array (w*h), row-major.
 */
export function ellipseMaskField(cx: number, cy: number, rx: number, ry: number, w: number, h: number, feather: number): Float32Array {
  const out = new Float32Array(w * h);
  const rX = Math.max(1e-4, rx), rY = Math.max(1e-4, ry);
  const inner = 1 - Math.min(0.999, Math.max(0, feather));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / rX, ny = (y - cy) / rY;
      const d = Math.sqrt(nx * nx + ny * ny);
      out[y * w + x] = 1 - smoothstep(inner, 1, d);
    }
  }
  return out;
}
