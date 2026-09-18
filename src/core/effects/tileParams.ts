// Motion tile & seamless scroll (B17) - pure param model (leaf module, no imports). Resolves a
// scroll offset per frame (resolution-relative, so a given speed reads the same on 720p and 4K) and
// wraps it seamlessly for a tiling layer, plus the tile-grid math. Pure function of the frame, so it
// is frame-pure (the timeline scrubs byte-identically). Unit-tested (verify:pattern-tile). The actual
// tiling render (repeat + mirror + edge blend) is the browser-gated B17-gpu motion-tile effect.

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const minSide = (w: number, h: number) => Math.max(1, Math.min(w, h));

/** Seamless wrap of an offset into [0, size): identical at 0 and `size` so a tiled scroll never jumps. */
export function wrapOffset(v: number, size: number): number {
  if (size <= 0) return 0;
  return ((v % size) + size) % size;
}

export interface ScrollParams {
  /** Scroll direction in degrees (0 = +x/right, 90 = +y/down). */
  direction: number;
  /** Speed 0..100, resolution-relative (fraction of the short side per second at 100). */
  speed: number;
}

export interface ScrollOffset { dx: number; dy: number; dxWrapped: number; dyWrapped: number }

/**
 * The scroll offset at `frame`. dx/dy grow linearly with time; dxWrapped/dyWrapped are folded into the
 * layer size for seamless tiling. Resolution-relative + frame-pure.
 */
export function resolveScroll(p: ScrollParams, frame: number, fps: number, w: number, h: number): ScrollOffset {
  const seconds = frame / Math.max(1, fps);
  const dist = (clamp(p.speed, 0, 100) / 100) * minSide(w, h) * seconds; // px travelled
  const a = p.direction * DEG;
  const dx = Math.cos(a) * dist;
  const dy = Math.sin(a) * dist;
  return { dx, dy, dxWrapped: wrapOffset(dx, w), dyWrapped: wrapOffset(dy, h) };
}

export interface MotionTile {
  tilesX: number;
  tilesY: number;
  mirror: boolean;
  scroll: ScrollParams;
}

export const DEFAULT_MOTION_TILE: MotionTile = { tilesX: 3, tilesY: 3, mirror: false, scroll: { direction: 0, speed: 20 } };

/** Clamp a motion-tile config into valid ranges (>=1 integer tile counts, speed 0..100). */
export function clampMotionTile(t: MotionTile): MotionTile {
  return {
    tilesX: Math.max(1, Math.round(t.tilesX)),
    tilesY: Math.max(1, Math.round(t.tilesY)),
    mirror: !!t.mirror,
    scroll: { direction: t.scroll.direction, speed: clamp(t.scroll.speed, 0, 100) },
  };
}

/**
 * Map a screen UV (0..1) into the source tile's UV, accounting for the tile grid, seamless scroll,
 * and optional mirroring (ping-pong so tile seams line up). Reference for the GPU motion-tile shader.
 */
export function tileUV(u: number, v: number, t: MotionTile, scroll: ScrollOffset, w: number, h: number): [number, number] {
  const su = u * t.tilesX + (w > 0 ? scroll.dxWrapped / w : 0);
  const sv = v * t.tilesY + (h > 0 ? scroll.dyWrapped / h : 0);
  let fu = ((su % 1) + 1) % 1;
  let fv = ((sv % 1) + 1) % 1;
  if (t.mirror) {
    if (Math.floor(su) % 2 !== 0) fu = 1 - fu;
    if (Math.floor(sv) % 2 !== 0) fv = 1 - fv;
  }
  return [fu, fv];
}
