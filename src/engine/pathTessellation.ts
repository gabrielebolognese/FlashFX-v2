import type { PathVertex, Vec2, Vec4, LineCap, LineJoin } from '../core/types';
import { LruCache } from './cache/lruCache';

// Tessellated geometry is stored as interleaved [x, y, r, g, b, a] floats, ready
// to upload to a GPU vertex buffer. Positions are in layer-local space (the same
// space the path vertices live in); the path vertex shader applies the layer
// transform. Geometry is only recomputed when points/handles/style change, then
// cached per layer.

export interface TessellatedPath {
  data: Float32Array;
  vertexCount: number;
}

export interface TessellateOptions {
  vertices: PathVertex[];
  closed: boolean;
  fillColor: Vec4;
  strokeColor: Vec4;
  strokeWidth: number;
  lineCap: LineCap;
  lineJoin: LineJoin;
}

const BEZIER_STEPS = 18;
const FLOATS_PER_VERTEX = 6;

function cubicAt(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

// Flatten a bezier path into a polyline of composition-local points.
export function flattenPath(vertices: PathVertex[], closed: boolean): Vec2[] {
  const n = vertices.length;
  if (n === 0) return [];
  if (n === 1) return [vertices[0].position.slice() as Vec2];

  const pts: Vec2[] = [];
  const segCount = closed ? n : n - 1;

  for (let i = 0; i < segCount; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const p0 = a.position;
    const p1: Vec2 = [a.position[0] + a.handleOut[0], a.position[1] + a.handleOut[1]];
    const p2: Vec2 = [b.position[0] + b.handleIn[0], b.position[1] + b.handleIn[1]];
    const p3 = b.position;

    const straight =
      a.handleOut[0] === 0 && a.handleOut[1] === 0 &&
      b.handleIn[0] === 0 && b.handleIn[1] === 0;

    if (i === 0) pts.push(p0.slice() as Vec2);

    if (straight) {
      pts.push(p3.slice() as Vec2);
    } else {
      for (let s = 1; s <= BEZIER_STEPS; s++) {
        pts.push(cubicAt(p0, p1, p2, p3, s / BEZIER_STEPS));
      }
    }
  }

  return pts;
}

function signedArea(pts: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function isConvex(prev: Vec2, cur: Vec2, next: Vec2, ccw: boolean): boolean {
  const cross = (cur[0] - prev[0]) * (next[1] - prev[1]) - (cur[1] - prev[1]) * (next[0] - prev[0]);
  return ccw ? cross >= 0 : cross <= 0;
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// Ear-clipping triangulation. Returns a flat list of triangle vertex coords.
function earClip(polygon: Vec2[]): Vec2[] {
  const n = polygon.length;
  if (n < 3) return [];

  const ccw = signedArea(polygon) > 0;
  const indices: number[] = [];
  for (let i = 0; i < n; i++) indices.push(i);

  const tris: Vec2[] = [];
  let guard = 0;
  const maxGuard = n * n;

  while (indices.length > 3 && guard++ < maxGuard) {
    let clipped = false;
    for (let i = 0; i < indices.length; i++) {
      const prevI = indices[(i - 1 + indices.length) % indices.length];
      const curI = indices[i];
      const nextI = indices[(i + 1) % indices.length];
      const prev = polygon[prevI];
      const cur = polygon[curI];
      const next = polygon[nextI];

      if (!isConvex(prev, cur, next, ccw)) continue;

      let hasInside = false;
      for (let j = 0; j < indices.length; j++) {
        const idx = indices[j];
        if (idx === prevI || idx === curI || idx === nextI) continue;
        if (pointInTriangle(polygon[idx], prev, cur, next)) {
          hasInside = true;
          break;
        }
      }
      if (hasInside) continue;

      tris.push(prev, cur, next);
      indices.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate; stop to avoid infinite loop
  }

  if (indices.length === 3) {
    tris.push(polygon[indices[0]], polygon[indices[1]], polygon[indices[2]]);
  }

  return tris;
}

function pushVertex(out: number[], p: Vec2, color: Vec4): void {
  out.push(p[0], p[1], color[0], color[1], color[2], color[3]);
}

function pushTri(out: number[], a: Vec2, b: Vec2, c: Vec2, color: Vec4): void {
  pushVertex(out, a, color);
  pushVertex(out, b, color);
  pushVertex(out, c, color);
}

function normal(dir: Vec2): Vec2 {
  return [-dir[1], dir[0]];
}

function norm(v: Vec2): Vec2 {
  const len = Math.hypot(v[0], v[1]);
  if (len < 1e-9) return [0, 0];
  return [v[0] / len, v[1] / len];
}

// Build stroke geometry for a polyline. Generates a quad per segment plus
// round/bevel/miter joins between segments and caps at the ends of open paths.
function buildStroke(
  pts: Vec2[],
  closed: boolean,
  width: number,
  color: Vec4,
  cap: LineCap,
  join: LineJoin,
  out: number[],
): void {
  if (pts.length < 2 || width <= 0 || color[3] <= 0) return;
  const hw = width / 2;

  // De-duplicate consecutive identical points.
  const path: Vec2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const last = path[path.length - 1];
    if (Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]) > 1e-6) path.push(pts[i]);
  }
  if (closed && path.length > 1) {
    const first = path[0];
    const last = path[path.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) path.pop();
  }
  if (path.length < 2) return;

  const segCount = closed ? path.length : path.length - 1;

  for (let i = 0; i < segCount; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const dir = norm([b[0] - a[0], b[1] - a[1]]);
    if (dir[0] === 0 && dir[1] === 0) continue;
    const nrm = normal(dir);
    const ox = nrm[0] * hw;
    const oy = nrm[1] * hw;

    const a1: Vec2 = [a[0] + ox, a[1] + oy];
    const a2: Vec2 = [a[0] - ox, a[1] - oy];
    const b1: Vec2 = [b[0] + ox, b[1] + oy];
    const b2: Vec2 = [b[0] - ox, b[1] - oy];

    pushTri(out, a1, a2, b1, color);
    pushTri(out, a2, b2, b1, color);
  }

  // Joins between consecutive segments.
  const joinCount = closed ? path.length : path.length - 2;
  for (let k = 0; k < joinCount; k++) {
    const i = closed ? k : k + 1;
    const prev = path[(i - 1 + path.length) % path.length];
    const cur = path[i];
    const next = path[(i + 1) % path.length];
    addJoin(prev, cur, next, hw, color, join, out);
  }

  // Caps for open paths.
  if (!closed) {
    addCap(path[1], path[0], hw, color, cap, out);
    addCap(path[path.length - 2], path[path.length - 1], hw, color, cap, out);
  }
}

function addJoin(prev: Vec2, cur: Vec2, next: Vec2, hw: number, color: Vec4, join: LineJoin, out: number[]): void {
  const d0 = norm([cur[0] - prev[0], cur[1] - prev[1]]);
  const d1 = norm([next[0] - cur[0], next[1] - cur[1]]);
  if ((d0[0] === 0 && d0[1] === 0) || (d1[0] === 0 && d1[1] === 0)) return;
  const n0 = normal(d0);
  const n1 = normal(d1);

  const cross = d0[0] * d1[1] - d0[1] * d1[0];
  if (Math.abs(cross) < 1e-6) return; // straight; nothing to fill
  const side = cross > 0 ? -1 : 1; // outer side

  const p0: Vec2 = [cur[0] + n0[0] * hw * side, cur[1] + n0[1] * hw * side];
  const p1: Vec2 = [cur[0] + n1[0] * hw * side, cur[1] + n1[1] * hw * side];

  if (join === 'round') {
    const a0 = Math.atan2(p0[1] - cur[1], p0[0] - cur[0]);
    let a1 = Math.atan2(p1[1] - cur[1], p1[0] - cur[0]);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 8)));
    let prevP: Vec2 = p0;
    for (let s = 1; s <= steps; s++) {
      const ang = a0 + (delta * s) / steps;
      const cp: Vec2 = [cur[0] + Math.cos(ang) * hw, cur[1] + Math.sin(ang) * hw];
      pushTri(out, cur, prevP, cp, color);
      prevP = cp;
    }
    a1 = a1; // noop, keeps lint quiet
  } else if (join === 'bevel') {
    pushTri(out, cur, p0, p1, color);
  } else {
    // miter: intersect the two outer offset lines
    const miter = miterPoint(cur, p0, d0, p1, d1, side, hw);
    if (miter) {
      pushTri(out, cur, p0, miter, color);
      pushTri(out, cur, miter, p1, color);
    } else {
      pushTri(out, cur, p0, p1, color);
    }
  }
}

function miterPoint(cur: Vec2, p0: Vec2, d0: Vec2, p1: Vec2, d1: Vec2, side: number, hw: number): Vec2 | null {
  // Lines: p0 + t*d0 and p1 + u*d1. Solve intersection.
  const denom = d0[0] * d1[1] - d0[1] * d1[0];
  if (Math.abs(denom) < 1e-6) return null;
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const t = (dx * d1[1] - dy * d1[0]) / denom;
  const mp: Vec2 = [p0[0] + d0[0] * t, p0[1] + d0[1] * t];
  // Limit miter length to avoid spikes.
  const miterLen = Math.hypot(mp[0] - cur[0], mp[1] - cur[1]);
  if (miterLen > hw * 4) return null;
  void side;
  return mp;
}

function addCap(inner: Vec2, end: Vec2, hw: number, color: Vec4, cap: LineCap, out: number[]): void {
  if (cap === 'butt') return;
  const dir = norm([end[0] - inner[0], end[1] - inner[1]]);
  if (dir[0] === 0 && dir[1] === 0) return;
  const nrm = normal(dir);
  const e1: Vec2 = [end[0] + nrm[0] * hw, end[1] + nrm[1] * hw];
  const e2: Vec2 = [end[0] - nrm[0] * hw, end[1] - nrm[1] * hw];

  if (cap === 'square') {
    const ex = dir[0] * hw;
    const ey = dir[1] * hw;
    const s1: Vec2 = [e1[0] + ex, e1[1] + ey];
    const s2: Vec2 = [e2[0] + ex, e2[1] + ey];
    pushTri(out, e1, e2, s1, color);
    pushTri(out, e2, s2, s1, color);
  } else {
    // round
    const baseAng = Math.atan2(nrm[1], nrm[0]);
    const steps = 8;
    let prevP: Vec2 = e1;
    for (let s = 1; s <= steps; s++) {
      const ang = baseAng - (Math.PI * s) / steps;
      const cp: Vec2 = [end[0] + Math.cos(ang) * hw, end[1] + Math.sin(ang) * hw];
      pushTri(out, end, prevP, cp, color);
      prevP = cp;
    }
  }
}

export function tessellatePath(opts: TessellateOptions): TessellatedPath {
  const out: number[] = [];
  const pts = flattenPath(opts.vertices, opts.closed);

  // Fill (only for closed paths with a visible fill).
  if (opts.closed && pts.length >= 3 && opts.fillColor[3] > 0) {
    const tris = earClip(pts);
    for (let i = 0; i < tris.length; i += 3) {
      pushTri(out, tris[i], tris[i + 1], tris[i + 2], opts.fillColor);
    }
  }

  // Stroke.
  buildStroke(pts, opts.closed, opts.strokeWidth, opts.strokeColor, opts.lineCap, opts.lineJoin, out);

  const data = new Float32Array(out);
  return { data, vertexCount: data.length / FLOATS_PER_VERTEX };
}

// ─── Per-layer cache (LRU, content-signature keyed) ───

interface CacheEntry {
  sig: string;
  result: TessellatedPath;
}

// Roughly 24 MB of tessellated geometry kept resident; oldest paths are evicted
// first once that budget (or the entry cap) is exceeded.
const cache = new LruCache<CacheEntry>({ maxBytes: 24 * 1024 * 1024, maxEntries: 256 });

function signature(opts: TessellateOptions): string {
  let s = `${opts.closed ? 1 : 0}|${opts.strokeWidth}|${opts.lineCap}|${opts.lineJoin}`;
  s += `|f${opts.fillColor.join(',')}|k${opts.strokeColor.join(',')}|`;
  for (const v of opts.vertices) {
    s += `${v.position[0]},${v.position[1]},${v.handleIn[0]},${v.handleIn[1]},${v.handleOut[0]},${v.handleOut[1]};`;
  }
  return s;
}

export function tessellatePathCached(layerId: string, opts: TessellateOptions): TessellatedPath {
  const sig = signature(opts);
  const existing = cache.peek(layerId);
  if (existing && existing.sig === sig) {
    cache.get(layerId); // refresh recency + count the hit
    return existing.result;
  }

  const result = tessellatePath(opts);
  cache.set(layerId, { sig, result }, result.data.byteLength);
  return result;
}

export function getPathTessellationStats() {
  return cache.stats();
}

export function clearPathTessellationCache(): void {
  cache.clear();
}

export const PATH_FLOATS_PER_VERTEX = FLOATS_PER_VERTEX;
