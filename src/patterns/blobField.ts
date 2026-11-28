// B58 gradient-blob field (pattern type 'blobField'): soft animated colour blobs as ONE layer.
//
// Two modes, both a pure function of (uv, aspect, time, config):
//  - field (floor = 0): a full-frame mesh gradient. N seeded blobs drift on slow Lissajous paths; each
//    pixel is the softmax-weighted blend of the blob colours (blob i = palette[i mod n]), so the frame
//    is fully covered and the colours flow into each other (the Lovable / Stripe gradient look).
//  - floor (0 < floor <= 1): a billowing cloud floor. A lumpy top edge (fbm drifting with time) at
//    `floor` x the layer height from the bottom; alpha fades in over the soft edge, the colour runs the
//    palette ramp by depth below the edge (pos 0 = the edge colour, pos 1 = the bottom) with billow
//    noise mixed in. Transparent above the edge, so it sits over whatever is below.
//
// Every random number and noise lattice value comes from an INTEGER hash (lowbias32, Math.imul) so the
// WGSL twin in engine/renderer.ts PATTERN_SHADER (pattern id 11) matches bit for bit up to f32
// arithmetic: the sin-hash the older patterns use diverges between f64 and f32 for large arguments.
// verify:blob-field + gpu:blob-field hold the two together.

import type { PatternConfig, PatternStop } from './types';

export type RGBA = [number, number, number, number];

/** Defaults for the optional blob fields (absent in the config = these). */
export const BLOB_DEFAULTS = {
  blobCount: 6,
  seed: 0,
  floor: 0,
  lumps: 0.12,
  softness: 1,
  billow: 0.25,
} as const;

export const BLOB_MAX = 16;
/** Largest seed that stays an exact integer in an f32 uniform. */
export const BLOB_SEED_MAX = 16777215;

export interface BlobParams {
  count: number;
  seed: number;
  floor: number;
  lumps: number;
  softness: number;
  billow: number;
}

const fin = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number): number => clamp(v, 0, 1);

/** The resolved, range-clamped blob parameters of a config (shared by the CPU twin and the uniform packer). */
export function resolveBlobParams(cfg: Pick<PatternConfig, 'blobCount' | 'seed' | 'floor' | 'lumps' | 'softness' | 'billow'>): BlobParams {
  return {
    count: Math.round(clamp(fin(cfg.blobCount, BLOB_DEFAULTS.blobCount), 1, BLOB_MAX)),
    seed: Math.round(clamp(fin(cfg.seed, BLOB_DEFAULTS.seed), 0, BLOB_SEED_MAX)),
    floor: clamp(fin(cfg.floor, BLOB_DEFAULTS.floor), 0, 1),
    lumps: clamp(fin(cfg.lumps, BLOB_DEFAULTS.lumps), 0, 1),
    softness: clamp(fin(cfg.softness, BLOB_DEFAULTS.softness), 0.05, 4),
    billow: clamp(fin(cfg.billow, BLOB_DEFAULTS.billow), 0, 2),
  };
}

// ---- integer hash + value noise (mirrored 1:1 in WGSL) ----

/** lowbias32 (Chris Wellons): u32 -> u32. */
export function hashU32(a: number): number {
  let x = a >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash of three integers (wrapping two's complement, like WGSL bitcast<u32>(i32)). */
export function hash3(a: number, b: number, c: number): number {
  return hashU32(((a | 0) >>> 0) ^ hashU32(((b | 0) >>> 0) ^ hashU32((c | 0) >>> 0)));
}

/** [0, 1) from 24 bits (exact in f32). */
export function rand3(a: number, b: number, c: number): number {
  return (hash3(a, b, c) >>> 8) / 16777216;
}

/** Bilinear smoothstep value noise on the integer lattice, salt = seed channel. */
export function blobNoise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = rand3(ix, iy, salt), b = rand3(ix + 1, iy, salt), c = rand3(ix, iy + 1, salt), d = rand3(ix + 1, iy + 1, salt);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

/** 4-octave fbm in [0, 1). */
export function blobFbm(x: number, y: number, salt: number): number {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) {
    v += amp * blobNoise(x * f, y * f, salt + o * 1013);
    f *= 2;
    amp *= 0.5;
  }
  return v / 0.9375;
}

/** One blob's centre (aspect units, origin at the layer centre) and radius at drift time tt. */
export function blobAt(i: number, seed: number, count: number, aspect: number, size: number, tt: number): { x: number; y: number; r: number } {
  const hx = rand3(i, 0, seed), hy = rand3(i, 1, seed);
  const p1 = rand3(i, 2, seed) * 6.2831853, p2 = rand3(i, 3, seed) * 6.2831853;
  const f1 = 0.45 + 0.8 * rand3(i, 4, seed), f2 = 0.45 + 0.8 * rand3(i, 5, seed);
  const rv = rand3(i, 6, seed);
  const amp = 0.22;
  const x = (hx - 0.5) * 0.9 * aspect + amp * Math.sin(tt * f1 + p1);
  const y = (hy - 0.5) * 0.9 + amp * Math.cos(tt * f2 + p2);
  const r = (0.62 / Math.sqrt(Math.max(1, count) / 4)) * Math.max(0.05, size) * (0.7 + 0.6 * rv);
  return { x, y, r };
}

function paletteColorAt(stops: PatternStop[], i: number): [number, number, number] {
  const n = Math.min(stops.length, 8);
  if (n <= 0) return [1, 1, 1];
  return stops[i % n].color;
}

/** Ramp sample on the first 8 stops in STORED order (the GPU palette is the first 8 stops as stored). */
function rampAt(stops: PatternStop[], v: number, smooth: boolean): [number, number, number] {
  const n = Math.min(stops.length, 8);
  if (n <= 0) return [v, v, v];
  if (v <= stops[0].pos) return stops[0].color;
  if (v >= stops[n - 1].pos) return stops[n - 1].color;
  for (let i = 0; i < n - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (v >= a.pos && v <= b.pos) {
      let t = (v - a.pos) / Math.max(0.0001, b.pos - a.pos);
      if (smooth) t = t * t * (3 - 2 * t);
      return [a.color[0] + (b.color[0] - a.color[0]) * t, a.color[1] + (b.color[1] - a.color[1]) * t, a.color[2] + (b.color[2] - a.color[2]) * t];
    }
  }
  return stops[n - 1].color;
}

/**
 * The blob field at uv (0..1, v down), aspect = width / height, t = seconds. `cfg.scale` = blob size
 * multiplier, `speed` = drift speed, `warp` = flowing domain warp, `contrast` = colour contrast,
 * `rotationDeg` rotates the field. Returns straight (not premultiplied) rgba in 0..1.
 */
export function blobFieldSample(cfg: PatternConfig, u: number, v: number, aspect: number, t: number): RGBA {
  const bp = resolveBlobParams(cfg);
  const tt = t * cfg.speed;
  let px = (u - 0.5) * aspect, py = v - 0.5;
  const a = (cfg.rotationDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  [px, py] = [px * c - py * s, px * s + py * c];
  const size = Math.max(0.05, cfg.scale);
  if (cfg.warp > 0) {
    const wx = blobFbm(px * 2.2 / size + tt * 0.11, py * 2.2 / size, bp.seed + 101) - 0.5;
    const wy = blobFbm(px * 2.2 / size + 5.2, py * 2.2 / size - tt * 0.13, bp.seed + 202) - 0.5;
    px += cfg.warp * 0.5 * wx;
    py += cfg.warp * 0.5 * wy;
  }
  let col: [number, number, number];
  let alpha = 1;
  if (bp.floor > 0) {
    const edgeN = blobFbm(px * 1.6 / size + tt * 0.25, tt * 0.12, bp.seed + 303) - 0.5;
    const edgeY = 0.5 - bp.floor + bp.lumps * 2 * edgeN;
    const depth = py - edgeY;
    const feather = 0.05 * bp.softness;
    const e = clamp01((depth + feather) / (2 * feather));
    alpha = e * e * (3 - 2 * e);
    const bil = blobFbm(px * 3 / size + tt * 0.1, py * 3 / size - tt * 0.05, bp.seed + 404) - 0.5;
    const k = clamp01(depth / Math.max(0.05, bp.floor) + bp.billow * bil);
    col = rampAt(cfg.palette, k, cfg.paletteMode === 'smooth');
  } else {
    let m = -1e30;
    const es: number[] = [];
    for (let i = 0; i < bp.count; i++) {
      const b = blobAt(i, bp.seed, bp.count, aspect, size, tt);
      const dx = px - b.x, dy = py - b.y;
      const e = -(dx * dx + dy * dy) / (b.r * b.r * bp.softness);
      es.push(e);
      if (e > m) m = e;
    }
    let sw = 0, r = 0, g = 0, bl = 0;
    for (let i = 0; i < bp.count; i++) {
      const w = Math.exp(es[i] - m);
      const pc = paletteColorAt(cfg.palette, i);
      sw += w; r += w * pc[0]; g += w * pc[1]; bl += w * pc[2];
    }
    col = [r / sw, g / sw, bl / sw];
  }
  if (cfg.contrast !== 0) {
    const k = 1 + cfg.contrast;
    col = [clamp01((col[0] - 0.5) * k + 0.5), clamp01((col[1] - 0.5) * k + 0.5), clamp01((col[2] - 0.5) * k + 0.5)];
  }
  return [col[0], col[1], col[2], alpha];
}

// ---- agent / store input (editor.addBlobField, editor.setBlobField) ----

/** What an agent passes. Numbers set the static value; size / warp / contrast are also the layer's
 *  keyframable pattern knobs (patternAnim.scale / warp / contrast), so they can be keyed later. */
export interface BlobFieldOptions {
  /** 'field' = full-frame mesh gradient (floor 0); 'floor' = cloud floor (floor defaults to 0.4). */
  mode?: 'field' | 'floor';
  /** At most 8 colours: hex '#rrggbb' / '#rgb' or [r, g, b(, a)] 0..1 (alpha ignored). Field: blob i
   *  uses colors[i mod n]. Floor: the ramp from the top edge (first) to the bottom (last). */
  colors?: (string | number[])[];
  count?: number;
  seed?: number;
  size?: number;
  speed?: number;
  warp?: number;
  contrast?: number;
  floor?: number;
  lumps?: number;
  softness?: number;
  billow?: number;
}

/** Mesh-field default colours (cream, pink, blue, coral, lilac: the r10 gradient family). */
export const BLOB_FIELD_COLORS = ['#f6eee8', '#e85aa6', '#5b6cf0', '#fd5d88', '#ab79d9'];
/** Cloud-floor default ramp (r06: blue edge to white bottom). */
export const BLOB_FLOOR_COLORS = ['#215cc4', '#558cdd', '#9dbdeb', '#e0e9f8'];
export const BLOB_FLOOR_DEFAULT = 0.4;

/** '#rrggbb' / '#rgb' -> rgb 0..1, or null. */
export function parseHexRgb(hex: unknown): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** A colour as hex or [r, g, b(, a)] 0..1 -> rgb 0..1, or null. */
export function parseColorRgb(c: unknown): [number, number, number] | null {
  if (typeof c === 'string') return parseHexRgb(c);
  if (Array.isArray(c) && (c.length === 3 || c.length === 4) && c.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];
  }
  return null;
}

/** Evenly spaced stops from colours (one colour is doubled: a palette needs 2 stops). Throws on bad input. */
export function stopsFromHex(colors: (string | number[])[]): PatternStop[] {
  if (!Array.isArray(colors) || colors.length === 0) throw new Error('colors must be a non-empty array of hex strings like "#215cc4" (or [r, g, b] 0..1)');
  if (colors.length > 8) throw new Error(`at most 8 colors (got ${colors.length})`);
  const rgb = colors.map((c, i) => {
    const v = parseColorRgb(c);
    if (!v) throw new Error(`colors[${i}] is not a colour (hex "#rrggbb" or [r, g, b] 0..1): ${JSON.stringify(c)}`);
    return v;
  });
  const list = rgb.length === 1 ? [rgb[0], rgb[0]] : rgb;
  return list.map((color, i) => ({ color, pos: i / (list.length - 1) }));
}

/**
 * Apply blob options onto a config (prev = the layer's current config, or null for a new layer).
 * Throws on invalid input (bad colours, non-numbers). The result always has type 'blobField'.
 */
export function applyBlobFieldOptions(prev: PatternConfig | null, opts: BlobFieldOptions): PatternConfig {
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) throw new Error('blob field options must be an object');
  const numKeys = ['count', 'seed', 'size', 'speed', 'warp', 'contrast', 'floor', 'lumps', 'softness', 'billow'] as const;
  for (const k of numKeys) {
    const v = opts[k];
    if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v))) throw new Error(`${k} must be a finite number`);
  }
  if (opts.mode !== undefined && opts.mode !== 'field' && opts.mode !== 'floor') throw new Error('mode must be "field" or "floor"');
  const wasFloor = !!prev && prev.type === 'blobField' && resolveBlobParams(prev).floor > 0;
  const floorMode = opts.mode === 'floor' || (opts.mode === undefined && (wasFloor || (opts.floor !== undefined && opts.floor > 0)));
  const base: PatternConfig = prev && prev.type === 'blobField'
    ? { ...prev }
    : {
      type: 'blobField', scale: 1, speed: 1, rotationDeg: prev ? prev.rotationDeg : 0, complexity: 7,
      warp: floorMode ? 0.2 : 0.35, contrast: 0, paletteMode: 'smooth',
      palette: stopsFromHex(floorMode ? BLOB_FLOOR_COLORS : BLOB_FIELD_COLORS),
      blobCount: 7, seed: 0, softness: BLOB_DEFAULTS.softness,
      ...(floorMode ? { floor: BLOB_FLOOR_DEFAULT, lumps: BLOB_DEFAULTS.lumps, billow: 0.35 } : {}),
    };
  const out: PatternConfig = { ...base, type: 'blobField' };
  if (opts.colors !== undefined && opts.colors !== null) out.palette = stopsFromHex(opts.colors);
  if (opts.count !== undefined) { out.blobCount = Math.round(clamp(opts.count, 1, BLOB_MAX)); out.complexity = out.blobCount; }
  if (opts.seed !== undefined) out.seed = Math.round(clamp(opts.seed, 0, BLOB_SEED_MAX));
  if (opts.size !== undefined) out.scale = clamp(opts.size, 0.05, 20);
  if (opts.speed !== undefined) out.speed = clamp(opts.speed, 0, 20);
  if (opts.warp !== undefined) out.warp = clamp(opts.warp, 0, 4);
  if (opts.contrast !== undefined) out.contrast = clamp(opts.contrast, -1, 4);
  if (opts.lumps !== undefined) out.lumps = clamp(opts.lumps, 0, 1);
  if (opts.softness !== undefined) out.softness = clamp(opts.softness, 0.05, 4);
  if (opts.billow !== undefined) out.billow = clamp(opts.billow, 0, 2);
  if (opts.mode === 'field') out.floor = 0;
  if (opts.floor !== undefined) out.floor = clamp(opts.floor, 0, 1);
  if (floorMode && !(resolveBlobParams(out).floor > 0)) out.floor = BLOB_FLOOR_DEFAULT;
  if (floorMode) {
    if (out.lumps === undefined) out.lumps = BLOB_DEFAULTS.lumps;
    if (out.billow === undefined) out.billow = BLOB_DEFAULTS.billow;
  }
  return out;
}
