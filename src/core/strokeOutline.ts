import pc from 'polygon-clipping';
import type { Ring, Polygon, MultiPolygon } from 'polygon-clipping';
import type { Vec2, PathVertex, LineCap, LineJoin } from './types';

// M22 — Outline stroke / stroke-to-path. Convert a center-line stroke into a filled, editable
// outline PolygonShape (outer ring + a hole ring for closed paths) — the prerequisite for
// tapering, boolean-cutting, stroke-reveal, exact SVG. Built as a UNION OF QUADS (one quad per
// flattened segment) plus round join/cap fillers, unioned with polygon-clipping so
// self-intersections dissolve automatically and a closed stroke's inner boundary falls out as a
// hole. Pure (polygon-clipping + types only) → harness-testable, no engine/DOM. v1 renders all
// joins/caps as round (butt/square caps honoured); miter/bevel approximate to round.

const cornerV = (p: Vec2): PathVertex => ({ position: [p[0] + 0, p[1] + 0], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' });

function cubicAt(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

const STEPS = 12;
function flatten(vertices: PathVertex[], closed: boolean): Vec2[] {
  const n = vertices.length;
  if (n < 2) return vertices.map((v) => [v.position[0], v.position[1]]);
  const pts: Vec2[] = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const A = vertices[i], B = vertices[(i + 1) % n];
    const p0 = A.position, p1: Vec2 = [A.position[0] + A.handleOut[0], A.position[1] + A.handleOut[1]];
    const p2: Vec2 = [B.position[0] + B.handleIn[0], B.position[1] + B.handleIn[1]], p3 = B.position;
    const straight = A.handleOut[0] === 0 && A.handleOut[1] === 0 && B.handleIn[0] === 0 && B.handleIn[1] === 0;
    if (i === 0) pts.push([p0[0], p0[1]]);
    if (straight) pts.push([p3[0], p3[1]]);
    else for (let s = 1; s <= STEPS; s++) pts.push(cubicAt(p0, p1, p2, p3, s / STEPS));
  }
  return pts;
}

function circle(c: Vec2, r: number, seg = 16): Ring {
  const ring: number[][] = [];
  for (let i = 0; i < seg; i++) { const a = (2 * Math.PI * i) / seg; ring.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
  ring.push(ring[0]);
  return ring as Ring;
}

function shoelace(ring: readonly number[][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
function dedupeRing(ring: readonly number[][] | undefined): number[][] | null {
  if (!ring || ring.length < 3) return null;
  const last = ring[ring.length - 1];
  return last[0] === ring[0][0] && last[1] === ring[0][1] ? (ring.slice(0, -1) as number[][]) : (ring as number[][]);
}

export interface StrokeOutlineResult { vertices: PathVertex[]; holes: PathVertex[][] }

/** Outline a stroked centerline into a filled polygon (outer + holes). null on degenerate input. */
export function outlineStroke(vertices: PathVertex[], closed: boolean, width: number, cap: LineCap, join: LineJoin): StrokeOutlineResult | null {
  void join; // v1: joins approximate to round via vertex circles
  if (!(width > 0)) return null;
  const flat = flatten(vertices, closed);
  const pts: Vec2[] = [];
  for (const p of flat) { const q = pts[pts.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) pts.push(p); }
  if (closed && pts.length > 1) { const f = pts[0], l = pts[pts.length - 1]; if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) pts.pop(); }
  if (pts.length < 2) return null;
  const hw = width / 2;

  const rings: Polygon[] = [];
  const segCount = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const nx = (-dy / len) * hw, ny = (dx / len) * hw;
    rings.push([[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]] as Ring]);
  }
  // Round join fillers at vertices (interior for open paths, all for closed).
  const jStart = closed ? 0 : 1, jEnd = closed ? pts.length : pts.length - 1;
  for (let i = jStart; i < jEnd; i++) rings.push([circle(pts[i], hw)]);
  // Caps on open paths.
  if (!closed) {
    if (cap === 'round') { rings.push([circle(pts[0], hw)]); rings.push([circle(pts[pts.length - 1], hw)]); }
    else if (cap === 'square') {
      const capQuad = (end: Vec2, prev: Vec2): Polygon => {
        const dx = end[0] - prev[0], dy = end[1] - prev[1], len = Math.hypot(dx, dy) || 1;
        const tx = (dx / len) * hw, ty = (dy / len) * hw, nx = (-dy / len) * hw, ny = (dx / len) * hw;
        return [[[end[0] + nx, end[1] + ny], [end[0] + nx + tx, end[1] + ny + ty], [end[0] - nx + tx, end[1] - ny + ty], [end[0] - nx, end[1] - ny], [end[0] + nx, end[1] + ny]] as Ring];
      };
      rings.push(capQuad(pts[0], pts[1]));
      rings.push(capQuad(pts[pts.length - 1], pts[pts.length - 2]));
    }
    // butt → flat quad ends, nothing extra
  }
  if (rings.length === 0) return null;

  // polygon-clipping's sweep line is precision-fragile with near-coincident points (the join
  // circles touch the quad corners); snap to a fine grid to keep it robust.
  const snap = (n: number) => Math.round(n * 1000) / 1000;
  const snapped: Polygon[] = rings.map((poly) => poly.map((ring) => ring.map(([x, y]) => [snap(x), snap(y)] as [number, number])) as Polygon);
  const [first, ...rest] = snapped;
  const result: MultiPolygon = pc.union(first, ...rest);

  // Take the largest-area output polygon (the stroke body); keep its holes.
  let best: Polygon | null = null, bestArea = -1;
  for (const polygon of result) {
    const outer = dedupeRing(polygon[0]);
    if (!outer) continue;
    const area = Math.abs(shoelace(outer));
    if (area > bestArea) { bestArea = area; best = polygon; }
  }
  if (!best) return null;
  const outer = dedupeRing(best[0]);
  if (!outer) return null;
  const holes: PathVertex[][] = [];
  for (let h = 1; h < best.length; h++) { const hr = dedupeRing(best[h]); if (hr) holes.push(hr.map((p) => cornerV([p[0], p[1]]))); }
  return { vertices: outer.map((p) => cornerV([p[0], p[1]])), holes };
}
