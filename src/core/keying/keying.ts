// Keying math (B28) - pure colour/matte science (leaf module, no imports, so esbuild bundles it
// standalone like colorTransfer.ts). Chroma key by YCbCr Cb/Cr-plane distance (luma ignored, so it
// keys evenly across a lit vs shadowed backing - the property naive RGB-Euclidean fails), a soft luma
// key, green/blue despill, and matte morphology (choke/feather). Everything is a deterministic pure
// function of its inputs (no Math.random / Date), unit-tested by scripts/verify-keying.mjs. The
// per-pixel GPU keyer (WGSL, alpha-writing) and the OffscreenCanvas bake are browser-only (B28-gpu /
// the Chroma Key image tool); this file is the shared, provable core they both build on.

export interface YCbCr { y: number; cb: number; cr: number }

/** Full-range BT.601 RGB -> YCbCr. r,g,b,y in 0..1; cb,cr in -0.5..0.5. Splits luma (y) from chroma
 *  (cb,cr) so a key can match colour while ignoring brightness. */
export function rgbToYCbCr(r: number, g: number, b: number): YCbCr {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
  return { y, cb, cr };
}

/** BT.709 relative luminance, 0..1 (perceptual weighting used for the luma key). */
export function luma709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Smoothstep: 0 below edge0, 1 above edge1, a smooth Hermite ramp between. Degenerate window
 *  (edge1 <= edge0) becomes a hard step at edge0. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Chroma-key alpha for one pixel: 0 = keyed (matches the backing) .. 1 = fully opaque (foreground).
 * Distance is measured only in the Cb/Cr plane (luma-independent), so a shadowed and a highlit region
 * of the same-hue backing key with one tolerance. `keyCb`/`keyCr` are precomputed once from the key
 * colour via rgbToYCbCr. `tolerance` is the fully-keyed radius, `softness` the soft falloff width.
 */
export function chromaKeyAlpha(r: number, g: number, b: number, keyCb: number, keyCr: number, tolerance: number, softness: number): number {
  const { cb, cr } = rgbToYCbCr(r, g, b);
  const d = Math.hypot(cb - keyCb, cr - keyCr);
  return smoothstep(tolerance, tolerance + Math.max(0, softness), d);
}

/**
 * Luma-key alpha for one pixel. By default keeps the bright end (alpha ramps 0 -> 1 as luma crosses
 * `threshold`..`threshold+softness`), so black is keyed and white is kept; `invert` flips it (key the
 * bright end instead). Used for luminance mattes / knocking out a black or white backing.
 */
export function lumaKeyAlpha(r: number, g: number, b: number, threshold: number, softness: number, invert = false): number {
  const y = luma709(r, g, b);
  const a = smoothstep(threshold, threshold + Math.max(0, softness), y);
  return invert ? 1 - a : a;
}

/**
 * Despill one pixel: pull the key channel (0=R, 1=G, 2=B) down toward the brighter of the other two
 * channels by `amount` (0 = off, 1 = fully clamped). Removes the green/blue fringe that a backing
 * casts onto the subject without touching pixels that are not spilled. Returns the corrected RGB.
 */
export function suppressSpill(r: number, g: number, b: number, keyChannel: number, amount: number): { r: number; g: number; b: number } {
  const k = Math.min(1, Math.max(0, amount));
  const out = { r, g, b };
  if (keyChannel === 0) { const lim = Math.max(g, b); if (r > lim) out.r = r - k * (r - lim); }
  else if (keyChannel === 2) { const lim = Math.max(r, g); if (b > lim) out.b = b - k * (b - lim); }
  else { const lim = Math.max(r, b); if (g > lim) out.g = g - k * (g - lim); } // green is the default key channel
  return out;
}

/**
 * Choke (erode) or spread (dilate) a scalar matte via a separable box min/max. `radius > 0` erodes
 * (shrinks the opaque region - tightens a matte that over-covers), `radius < 0` dilates (grows it),
 * `radius === 0` is identity. Out-of-bounds neighbours are skipped so the frame border is not eroded.
 * Returns a NEW Float32Array (input untouched).
 */
export function chokeMatte(alpha: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.round(Math.abs(radius));
  if (r === 0 || w <= 0 || h <= 0) return new Float32Array(alpha);
  const erode = radius > 0;
  const seed = erode ? Infinity : -Infinity;
  const pick = erode ? Math.min : Math.max;
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = seed;
      const lo = Math.max(0, x - r), hi = Math.min(w - 1, x + r);
      for (let xx = lo; xx <= hi; xx++) acc = pick(acc, alpha[row + xx]);
      tmp[row + x] = acc;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const lo = Math.max(0, y - r), hi = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      let acc = seed;
      for (let yy = lo; yy <= hi; yy++) acc = pick(acc, tmp[yy * w + x]);
      out[y * w + x] = acc;
    }
  }
  return out;
}

/**
 * Feather a scalar matte with a separable box blur (edge pixels are clamped/replicated so total matte
 * energy is roughly preserved). `radius === 0` is identity. Softens a hard cutout edge into a smooth
 * alpha ramp. Returns a NEW Float32Array (input untouched).
 */
export function featherMatte(alpha: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.round(Math.abs(radius));
  if (r === 0 || w <= 0 || h <= 0) return new Float32Array(alpha);
  const win = 2 * r + 1;
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dx = -r; dx <= r; dx++) {
        let xx = x + dx; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
        s += alpha[row + xx];
      }
      tmp[row + x] = s / win;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let dy = -r; dy <= r; dy++) {
        let yy = y + dy; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
        s += tmp[yy * w + x];
      }
      out[y * w + x] = s / win;
    }
  }
  return out;
}

/** Index of the dominant channel of an sRGB colour (0=R,1=G,2=B) - the despill key channel for a
 *  green vs blue screen chosen automatically from the key colour. */
export function dominantChannel(r: number, g: number, b: number): number {
  if (g >= r && g >= b) return 1;
  if (b >= r && b >= g) return 2;
  return 0;
}
