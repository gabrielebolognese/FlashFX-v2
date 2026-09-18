// Shatter / fracture (B23) - pure geometry (leaf module, no imports). Decomposes a rectangle into
// Voronoi shards from seeded sites (each shard is the exact Voronoi cell polygon, computed by clipping
// the rect with the perpendicular bisector half-planes - Sutherland-Hodgman), and gives each shard a
// frame-pure explosion trajectory (fly outward from the fracture centre + spin + gravity + fade).
// Deterministic + unit-tested (verify:destruction). The rendered pieces are the B23-render consumer.

export type Pt = [number, number];

export interface Shard {
  /** Voronoi site (in centred coords, [-w/2,w/2] x [-h/2,h/2]). */
  site: Pt;
  /** Cell polygon vertices (CCW-ish, centred coords). */
  polygon: Pt[];
  /** Area-weighted centroid of the polygon. */
  centroid: Pt;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Keep the part of `poly` on the side a*x + b*y <= c (Sutherland-Hodgman half-plane clip). */
function clipHalfPlane(poly: Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  const inside = (p: Pt) => a * p[0] + b * p[1] <= c + 1e-9;
  const intersect = (p: Pt, q: Pt): Pt => {
    const dp = a * p[0] + b * p[1];
    const dq = a * q[0] + b * q[1];
    const t = (c - dp) / ((dq - dp) || 1e-12);
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const prev = poly[(i + n - 1) % n];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

export function polygonArea(poly: Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(poly: Pt[]): Pt {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const cross = p[0] * q[1] - q[0] * p[1];
    a += cross; cx += (p[0] + q[0]) * cross; cy += (p[1] + q[1]) * cross;
  }
  if (Math.abs(a) < 1e-9) { // degenerate - average the vertices
    for (const p of poly) { cx += p[0]; cy += p[1]; }
    const n = Math.max(1, poly.length);
    return [cx / n, cy / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Fracture a `width` x `height` rect (centred at 0) into `count` Voronoi shards, seeded + deterministic. */
export function fractureVoronoi(width: number, height: number, count: number, seed: number): Shard[] {
  const n = Math.max(1, Math.floor(count));
  const rng = mulberry32(seed >>> 0);
  const hw = width / 2, hh = height / 2;
  const sites: Pt[] = [];
  for (let i = 0; i < n; i++) sites.push([(rng() - 0.5) * width, (rng() - 0.5) * height]);
  const rect: Pt[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];

  const shards: Shard[] = [];
  for (let i = 0; i < n; i++) {
    let cell = rect;
    const s = sites[i];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const t = sites[j];
      // keep points closer to s than t: (t-s)·p <= (|t|^2 - |s|^2)/2
      const a = t[0] - s[0], b = t[1] - s[1];
      const cc = (t[0] * t[0] + t[1] * t[1] - s[0] * s[0] - s[1] * s[1]) / 2;
      cell = clipHalfPlane(cell, a, b, cc);
      if (cell.length < 3) break;
    }
    if (cell.length >= 3) shards.push({ site: s, polygon: cell, centroid: polygonCentroid(cell) });
  }
  return shards;
}

export interface ExplodeParams {
  /** Frame the explosion begins. */
  startFrame: number;
  /** Frames until fully dispersed / faded. */
  duration: number;
  /** Outward launch speed (px/s at the source frame rate baked into `dt`). */
  strength: number;
  /** Downward acceleration. */
  gravity: number;
  /** Max spin (deg/s), scaled per shard by its seed. */
  spin: number;
  fps: number;
}

export interface ShardTransform { dx: number; dy: number; rotation: number; opacity: number }

/**
 * A shard's transform at `frame`: it flies out from `origin` along (centroid - origin) with per-shard
 * speed/spin jitter, falls under gravity, and fades over the duration. Pure + frame-pure (jitter is
 * seeded by the shard index), so scrubbing is byte-identical. Before startFrame it's the rest pose.
 */
export function shardExplode(shard: Shard, index: number, origin: Pt, frame: number, p: ExplodeParams): ShardTransform {
  if (frame <= p.startFrame) return { dx: 0, dy: 0, rotation: 0, opacity: 1 };
  const rng = mulberry32((index * 2654435761) >>> 0);
  const t = (frame - p.startFrame) / p.fps; // seconds since blast
  let dirX = shard.centroid[0] - origin[0];
  let dirY = shard.centroid[1] - origin[1];
  const len = Math.hypot(dirX, dirY) || 1;
  dirX /= len; dirY /= len;
  const speed = p.strength * (0.6 + 0.8 * rng());
  const spin = p.spin * (rng() * 2 - 1);
  const dx = dirX * speed * t;
  const dy = dirY * speed * t + 0.5 * p.gravity * t * t;
  const rotation = spin * t;
  const life = Math.min(1, (frame - p.startFrame) / Math.max(1, p.duration));
  return { dx, dy, rotation, opacity: Math.max(0, 1 - life) };
}
