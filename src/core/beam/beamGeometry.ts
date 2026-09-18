// Light beams & lightning (B16) - pure geometry (leaf module, no imports). Builds a straight energy
// beam or a jagged lightning bolt between two points as a polyline, and offsets a polyline into a
// ribbon (for a glowing quad strip). Lightning uses seeded midpoint displacement (house mulberry32),
// so it is FRAME-PURE: pass frameNumber into the seed and the bolt is identical every time that frame
// resolves (the timeline scrubs byte-identically). Deterministic + unit-tested (verify:beam-geometry).
// The GPU/layer rendering of the ribbon (glow beam) is B16-gpu.

export type Pt = [number, number];

// House PRNG - identical to the cloner's, so beams stay frame-pure (never Math.random/Date).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A straight beam centreline (just the two endpoints). */
export function straightBeam(a: Pt, b: Pt): Pt[] {
  return [[a[0], a[1]], [b[0], b[1]]];
}

export interface LightningOptions {
  /** Subdivision iterations (each doubles the segment count). Higher = more detail. */
  iterations?: number;
  /** Displacement amplitude in pixels at the first iteration (halves each iteration). */
  amplitude?: number;
  /** Seed - mix in the frame number to keep it frame-pure yet animate over time. */
  seed?: number;
}

/**
 * A jagged lightning polyline from a to b via midpoint displacement. Endpoints are always exactly a
 * and b. amplitude 0 (or iterations 0) yields the straight segment. Perpendicular displacement so the
 * bolt zig-zags across the a->b axis.
 */
export function lightningPath(a: Pt, b: Pt, opts: LightningOptions = {}): Pt[] {
  const iterations = Math.max(0, Math.floor(opts.iterations ?? 5));
  const amp0 = Math.max(0, opts.amplitude ?? 24);
  const rng = mulberry32((opts.seed ?? 1) >>> 0);
  let pts: Pt[] = [[a[0], a[1]], [b[0], b[1]]];
  let amp = amp0;
  for (let it = 0; it < iterations && amp > 0; it++) {
    const next: Pt[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      // unit perpendicular to the segment
      let dx = q[0] - p[0], dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const off = (rng() * 2 - 1) * amp;
      next.push([mx - dy * off, my + dx * off]);
      next.push(q);
    }
    pts = next;
    amp *= 0.5;
  }
  return pts;
}

/**
 * Offset a polyline into a ribbon of the given width (a closed outline: forward along the left edge,
 * back along the right). `taper` (0..1) narrows the width toward both ends for a beam look.
 */
export function ribbon(points: Pt[], width: number, taper = 0): { left: Pt[]; right: Pt[]; outline: Pt[] } {
  const n = points.length;
  const half = Math.max(0, width) / 2;
  const left: Pt[] = []; const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    // local direction (average of adjacent segments)
    const prev = points[Math.max(0, i - 1)];
    const nxt = points[Math.min(n - 1, i + 1)];
    let dx = nxt[0] - prev[0], dy = nxt[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    // perpendicular
    const nx = -dy, ny = dx;
    const t = n > 1 ? i / (n - 1) : 0;
    const w = half * (1 - taper * (1 - 4 * t * (1 - t))); // taper toward the ends (0 at ends if taper=1)
    const p = points[i];
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  }
  const outline: Pt[] = [...left, ...right.slice().reverse()];
  return { left, right, outline };
}

/** A lightning bolt as a ribbon outline (convenience). */
export function lightningRibbon(a: Pt, b: Pt, width: number, opts: LightningOptions = {}): Pt[] {
  return ribbon(lightningPath(a, b, opts), width, opts && (opts as { taper?: number }).taper ? (opts as { taper?: number }).taper! : 0).outline;
}
