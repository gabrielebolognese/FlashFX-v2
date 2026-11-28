// Pixel-block dissolve / build-on (B54): the pure half. A blocks mask (Mask.blocks) is a seeded block
// pattern evaluated per pixel by the mask WGSL (engine/maskWgsl.ts `mask_blocksEval`); this module is
// its CPU twin's arithmetic (core/maskCoverage.ts calls `blocksSlotVisible` for a packed slot) plus the
// builders the agent helper uses. Everything is a pure function of (seed, block index, progress):
// scrubbing is byte-identical and no Math.random / Date is involved.
//
// Slot layout (a 2-slot run, packed by core/maskCoverage.ts packMaskSlots):
//   header  params = (6, invert + 2 * maskMode, opacity, blockSize)   center = region centre (comp px)
//           size = region half extents   rot = region rotation (rad)   points = seed   inner = span (2)
//   data    [0] progress  [1] order id  [2] dirX  [3] dirY  [4] jitter  [5] out (0 / 1)
//
// Block (ix, iy) covers local [ix * s - hx, (ix + 1) * s - hx) x [iy * s - hy, ...) in the region's
// rotated frame (the grid starts at the region's top-left corner and continues past it). Its threshold:
//   random       t = hash(seed, ix, iy)
//   directional  u = projection of the block centre on (dirX, dirY), 0 at the trailing edge of the
//                region, 1 at the leading edge; t = u + (hash - u) * jitter
//   center       u = |block centre / half extents| / sqrt 2; t = u + (hash - u) * jitter
// Visible ('in') when t < progress (all of them at progress >= 1); 'out' shows the complement.
// Leaf module (type imports only) -> node-harnessable (`verify:pixel-blocks`).

import type { AnimatableProperty, Keyframe, MaskBlocks, PixelBlockOrder, ResolvedMaskBlocks } from './types';

export const BLOCKS_MASK_TYPE = 6;
export const BLOCKS_MASK_SLOTS = 2;
export const PIXEL_BLOCK_ORDERS: readonly PixelBlockOrder[] = ['random', 'directional', 'center'];
export const PIXEL_BLOCK_ORDER_ID: Record<PixelBlockOrder, number> = { random: 0, directional: 1, center: 2 };
/** Seeds are packed into an f32, so they are kept in the exactly representable integer range. */
export const PIXEL_BLOCK_SEED_MAX = 16777215;

export function isPixelBlockOrder(v: unknown): v is PixelBlockOrder {
  return typeof v === 'string' && (PIXEL_BLOCK_ORDERS as readonly string[]).includes(v);
}

/**
 * The block hash, bit-identical to the WGSL `mask_blockHash`: the block index is mixed into the seed,
 * then one mulberry32 step (the house RNG) finalizes it. Returns [0, 1) quantized to 24 bits, so the
 * f32 the shader computes is the same number.
 */
export function pixelBlockHash(seed: number, ix: number, iy: number): number {
  const h = ((seed >>> 0) ^ Math.imul(ix | 0, 0x9e3779b1) ^ Math.imul(iy | 0, 0x85ebca77)) >>> 0;
  const a = (h + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1) >>> 0;
  t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
  t = (t ^ (t >>> 14)) >>> 0;
  return (t >>> 8) / 16777216;
}

export interface PixelBlockParams {
  seed: number;
  orderId: number;
  dirX: number;
  dirY: number;
  jitter: number;
  /** Region half extents (px). */
  hx: number;
  hy: number;
  /** Block edge (px). */
  size: number;
}

/** A block's threshold in [0, 1]: the progress at which it switches. */
export function pixelBlockThreshold(p: PixelBlockParams, ix: number, iy: number): number {
  const r = pixelBlockHash(p.seed, ix, iy);
  if (p.orderId === 0) return r;
  const bcx = (ix + 0.5) * p.size - p.hx;
  const bcy = (iy + 0.5) * p.size - p.hy;
  let u: number;
  if (p.orderId === 1) {
    const ext = Math.max(p.hx * Math.abs(p.dirX) + p.hy * Math.abs(p.dirY), 1e-3);
    u = Math.min(1, Math.max(0, 0.5 + (0.5 * (bcx * p.dirX + bcy * p.dirY)) / ext));
  } else {
    const nx = bcx / Math.max(p.hx, 1e-3), ny = bcy / Math.max(p.hy, 1e-3);
    u = Math.min(1, Math.max(0, Math.sqrt(nx * nx + ny * ny) * 0.70710678));
  }
  return u + (r - u) * p.jitter;
}

/** Is a block with this threshold shown at `progress`? */
export function pixelBlockShown(threshold: number, progress: number, out: boolean): boolean {
  const vin = threshold < progress || progress >= 1;
  return out ? !vin : vin;
}

/** Decode the params of a packed blocks run whose header is at float `o` (data slot at o + 12). */
export function blocksSlotParams(b: ArrayLike<number>, o: number): PixelBlockParams & { progress: number; out: boolean } {
  const d = o + 12;
  return {
    seed: Math.round(b[o + 9]),
    orderId: Math.round(b[d + 1]),
    dirX: b[d + 2],
    dirY: b[d + 3],
    jitter: b[d + 4],
    hx: b[o + 6],
    hy: b[o + 7],
    size: Math.max(b[o + 3], 1),
    progress: b[d],
    out: b[d + 5] > 0.5,
  };
}

/** The block index under comp point (x, y) for a packed run at `o`. */
export function blocksSlotIndex(b: ArrayLike<number>, o: number, x: number, y: number): [number, number] {
  const relX = x - b[o + 4], relY = y - b[o + 5];
  const c = Math.cos(-b[o + 8]), s = Math.sin(-b[o + 8]);
  const px = relX * c - relY * s, py = relX * s + relY * c;
  const size = Math.max(b[o + 3], 1);
  return [Math.floor((px + b[o + 6]) / size), Math.floor((py + b[o + 7]) / size)];
}

/** Coverage (before invert / opacity) of the packed blocks run at `o` at comp point (x, y): 0 or 1. */
export function blocksSlotVisible(b: ArrayLike<number>, o: number, x: number, y: number): boolean {
  const p = blocksSlotParams(b, o);
  const [ix, iy] = blocksSlotIndex(b, o, x, y);
  return pixelBlockShown(pixelBlockThreshold(p, ix, iy), p.progress, p.out);
}

/** Unit sweep vector of a directional order (angle in degrees, 0 = left to right, 90 = top to bottom). */
export function pixelBlockDirection(angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}

/** Normalize authored block params (agent / project load): finite, clamped, integer seed. */
export function normalizeBlockParams(raw: Partial<Omit<MaskBlocks, 'progress'>>): Omit<MaskBlocks, 'progress'> {
  const fin = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    size: Math.max(1, fin(raw.size, 16)),
    seed: Math.min(PIXEL_BLOCK_SEED_MAX, Math.max(0, Math.round(fin(raw.seed, 1)))),
    order: isPixelBlockOrder(raw.order) ? raw.order : 'random',
    angle: fin(raw.angle, 0),
    jitter: Math.min(1, Math.max(0, fin(raw.jitter, 0.35))),
    direction: raw.direction === 'out' ? 'out' : 'in',
  };
}

/** Pack a resolved blocks mask's data slot floats (12). */
export function packBlocksData(rb: ResolvedMaskBlocks): number[] {
  const [dx, dy] = pixelBlockDirection(rb.angle);
  return [
    Math.min(1, Math.max(0, rb.progress)), PIXEL_BLOCK_ORDER_ID[rb.order] ?? 0, dx, dy,
    Math.min(1, Math.max(0, rb.jitter)), rb.direction === 'out' ? 1 : 0, 0, 0, 0, 0, 0, 0,
  ];
}

// ── Schedule (the agent helper's progress keys) ──

export interface PixelBlockScheduleOptions {
  startFrame: number;
  durationFrames: number;
  /** Hold the progress for this many frames between steps (1 = a new batch every frame). */
  stepFrames?: number;
}

/**
 * The progress keys of a reveal: 0 at startFrame, 1 at startFrame + durationFrames. With stepFrames 1
 * the two keys are linear (a new batch of blocks every frame); with stepFrames > 1 they are hold keys
 * every stepFrames frames (8-bit "on twos" stepping). Integer frames only.
 */
export function pixelBlockProgressKeys(opts: PixelBlockScheduleOptions): { frame: number; value: number; hold: boolean }[] {
  const start = Math.round(opts.startFrame);
  const dur = Math.max(1, Math.round(opts.durationFrames));
  const step = Math.max(1, Math.round(opts.stepFrames ?? 1));
  if (step <= 1) return [{ frame: start, value: 0, hold: false }, { frame: start + dur, value: 1, hold: false }];
  const out: { frame: number; value: number; hold: boolean }[] = [];
  for (let f = 0; f < dur; f += step) out.push({ frame: start + f, value: f / dur, hold: true });
  out.push({ frame: start + dur, value: 1, hold: true });
  return out;
}

/** The progress keys as an AnimatableProperty (fresh ids supplied by the caller). */
export function pixelBlockProgressProperty(id: string, opts: PixelBlockScheduleOptions): AnimatableProperty {
  const keys: Keyframe[] = pixelBlockProgressKeys(opts).map((k) => ({
    frame: k.frame, value: k.value, interpolation: k.hold ? 'hold' : 'linear', handleIn: [0, 0], handleOut: [0, 0],
  }));
  return { id, name: 'Block Progress', valueType: 'number', defaultValue: 0, keyframes: keys };
}

/**
 * Fraction of the region's blocks shown at `progress` (whole blocks whose centre is inside the region).
 * The coverage schedule `verify:pixel-blocks` checks: for a random order it tracks progress.
 */
export function pixelBlockShownFraction(p: PixelBlockParams, progress: number, out: boolean): { shown: number; total: number } {
  const cols = Math.ceil((2 * p.hx) / p.size), rows = Math.ceil((2 * p.hy) / p.size);
  let shown = 0;
  for (let iy = 0; iy < rows; iy++) for (let ix = 0; ix < cols; ix++) {
    if (pixelBlockShown(pixelBlockThreshold(p, ix, iy), progress, out)) shown++;
  }
  return { shown, total: cols * rows };
}
