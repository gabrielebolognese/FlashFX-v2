// Pure path-modifier operators for shape layers (B8a) — Trim Paths (draw-on), Offset Paths
// (inset/outset), and Roughen (jagged edges). Each is a deterministic PathVertex[] → PathVertex[]
// transform applied at RESOLVE time (see resolveShapeLayer), so the already-existing polygon
// tessellation pipeline draws the result with NO renderer change. A leaf module: it imports only
// `evalCubic` (itself pure) + types, so it bundles in a node harness (`verify:shape-motion`).
//
// Modifiers are OPT-IN: with none present the resolver returns the original vertices untouched, so
// existing shapes are byte-identical. Trim/Roughen emit a flattened polyline (corner vertices) — the
// tessellator flattens beziers anyway, so the rendered result matches a curve-preserving trim while
// keeping the maths robust and testable. Offset preserves vertex count and relative handles.

import type { Vec2, PathVertex } from './types';
import { evalCubic } from './bend';

// ── small vec helpers (all return fresh arrays) ──
function sub(a: Vec2, b: Vec2): Vec2 { return [a[0] - b[0], a[1] - b[1]]; }
function add(a: Vec2, b: Vec2): Vec2 { return [a[0] + b[0], a[1] + b[1]]; }
function scale(a: Vec2, s: number): Vec2 { return [a[0] * s, a[1] * s]; }
function len(a: Vec2): number { return Math.hypot(a[0], a[1]); }
function norm(a: Vec2): Vec2 { const l = len(a); return l < 1e-9 ? [0, 0] : [a[0] / l, a[1] / l]; }
function perp(a: Vec2): Vec2 { return [a[1], -a[0]]; } // rotate −90°; outward sign fixed by orient()

function cornerVertex(p: Vec2): PathVertex {
  return { position: [p[0], p[1]], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' };
}

/** Deterministic PRNG (house mulberry32) — Roughen must be frame-pure, so no Math.random/Date. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Flatten a whole path (respecting `closed`) into a dense polyline with cumulative arc length.
// For a closed path the returned point list ends with a copy of the first point (cum = total).
function flattenAll(vertices: PathVertex[], closed: boolean, perSeg: number): { pts: Vec2[]; cum: number[]; total: number } {
  const n = vertices.length;
  const segCount = closed ? n : n - 1;
  const pts: Vec2[] = [[vertices[0].position[0], vertices[0].position[1]]];
  const cum: number[] = [0];
  for (let s = 0; s < segCount; s++) {
    const a = vertices[s];
    const b = vertices[(s + 1) % n];
    for (let k = 1; k <= perSeg; k++) {
      const p = evalCubic(a, b, k / perSeg);
      const prev = pts[pts.length - 1];
      cum.push(cum[cum.length - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
      pts.push([p[0], p[1]]);
    }
  }
  return { pts, cum, total: cum[cum.length - 1] };
}

function pointAtLen(pts: Vec2[], cum: number[], target: number): Vec2 {
  const total = cum[cum.length - 1];
  if (target <= 0) return [pts[0][0], pts[0][1]];
  if (target >= total) { const last = pts[pts.length - 1]; return [last[0], last[1]]; }
  // linear scan (paths here are small); find the bracketing sample
  let i = 0;
  while (i < cum.length - 1 && cum[i + 1] < target) i++;
  const span = cum[i + 1] - cum[i];
  const t = span < 1e-9 ? 0 : (target - cum[i]) / span;
  const a = pts[i], b = pts[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Collect the contiguous polyline points between two arc lengths a≤b (inclusive endpoints).
function collectContiguous(pts: Vec2[], cum: number[], a: number, b: number): Vec2[] {
  const out: Vec2[] = [pointAtLen(pts, cum, a)];
  for (let i = 0; i < cum.length; i++) {
    if (cum[i] > a + 1e-9 && cum[i] < b - 1e-9) out.push([pts[i][0], pts[i][1]]);
  }
  out.push(pointAtLen(pts, cum, b));
  return out;
}

/**
 * Trim Paths (draw-on). `start`/`end` are fractions in [0,1] of the total path length; `offset`
 * shifts the visible window (fraction; wraps on closed paths). Returns a flattened open sub-path.
 * Full coverage (window length ≥ 1) returns the ORIGINAL vertices so 100% trim is byte-identical to
 * no modifier. Empty window returns no vertices (nothing drawn — a 0% draw-on).
 */
export function trimPath(
  vertices: PathVertex[],
  closed: boolean,
  start: number,
  end: number,
  offset: number,
  perSeg = 24,
): { vertices: PathVertex[]; closed: boolean } {
  const n = vertices.length;
  if (n < 2) return { vertices, closed };

  let lo = start, hi = end;
  if (hi < lo) { const t = lo; lo = hi; hi = t; }
  const covered = hi - lo;
  if (covered >= 1 - 1e-6) return { vertices, closed };   // full → keep beziers
  if (covered <= 1e-6) return { vertices: [], closed: false }; // nothing

  const { pts, cum, total } = flattenAll(vertices, closed, perSeg);
  if (total <= 0) return { vertices, closed };

  lo += offset; hi += offset;
  let ptsOut: Vec2[];
  if (closed) {
    // periodic ring — normalize the start into [0,1); the window may cross the seam.
    const loW = ((lo % 1) + 1) % 1;
    const hiW = loW + covered;
    if (hiW <= 1 + 1e-9) {
      ptsOut = collectContiguous(pts, cum, loW * total, hiW * total);
    } else {
      const head = collectContiguous(pts, cum, loW * total, total);
      const tail = collectContiguous(pts, cum, 0, (hiW - 1) * total);
      ptsOut = head.concat(tail.slice(1)); // seam point is shared (ring closes) → drop the duplicate
    }
  } else {
    const a = Math.max(0, Math.min(1, lo)) * total;
    const b = Math.max(0, Math.min(1, hi)) * total;
    if (b - a <= 1e-6) return { vertices: [], closed: false };
    ptsOut = collectContiguous(pts, cum, a, b);
  }
  return { vertices: ptsOut.map(cornerVertex), closed: false };
}

/**
 * Offset Paths (inset/outset). Moves each vertex along its outward miter bisector by `amount`
 * (positive = outset/grow, negative = inset/shrink), giving a true parallel offset for straight
 * edges; the miter length is capped by `miterLimit` so sharp corners don't spike. Relative handles
 * are preserved (curve segments translate along the offset). Vertex count is unchanged.
 */
export function offsetPath(vertices: PathVertex[], closed: boolean, amount: number, miterLimit = 4): PathVertex[] {
  const n = vertices.length;
  if (n < 2 || amount === 0) return vertices.map((v) => ({ ...v }));

  // centroid (of anchor positions) — used to orient every normal outward, winding-agnostic.
  let cx = 0, cy = 0;
  for (const v of vertices) { cx += v.position[0]; cy += v.position[1]; }
  const centroid: Vec2 = [cx / n, cy / n];
  const outward = (nrm: Vec2, at: Vec2): Vec2 => {
    const away = sub(at, centroid);
    return (nrm[0] * away[0] + nrm[1] * away[1]) < 0 ? [-nrm[0], -nrm[1]] : nrm;
  };
  const minCos = 1 / miterLimit;

  return vertices.map((v, i) => {
    const prev = vertices[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = vertices[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dIn = norm(sub(v.position, prev.position));
    const dOut = norm(sub(next.position, v.position));
    let nIn = outward(perp(dIn), v.position);
    let nOut = outward(perp(dOut), v.position);
    if (!closed && i === 0) nIn = nOut;         // open start has only the outgoing edge
    if (!closed && i === n - 1) nOut = nIn;      // open end has only the incoming edge
    let bis = norm(add(nIn, nOut));
    if (len(bis) < 1e-6) bis = nOut;             // 180° reversal → fall back to one normal
    const cosHalf = Math.max(bis[0] * nOut[0] + bis[1] * nOut[1], minCos);
    const newPos = add(v.position, scale(bis, amount / cosHalf));
    return { ...v, position: newPos };
  });
}

/**
 * Roughen. Subdivides the path (`perSeg` samples/segment) and displaces every point along its local
 * normal by a seeded pseudo-random amount in [−amount, amount]. Deterministic per `seed` (frame-pure
 * via mulberry32). `amount = 0` is a no-op. Emits a flattened polyline.
 */
export function roughenPath(
  vertices: PathVertex[],
  closed: boolean,
  amount: number,
  seed: number,
  perSeg = 8,
): { vertices: PathVertex[]; closed: boolean } {
  if (amount === 0 || vertices.length < 2) return { vertices: vertices.map((v) => ({ ...v })), closed };
  const flat = flattenAll(vertices, closed, perSeg);
  // For a closed ring the last point duplicates the first — drop it and let `closed` re-close.
  const pts = closed ? flat.pts.slice(0, -1) : flat.pts;
  const m = pts.length;
  if (m < 2) return { vertices: vertices.map((v) => ({ ...v })), closed };
  const rng = mulberry32(seed);
  const out: PathVertex[] = [];
  for (let i = 0; i < m; i++) {
    const prevP = pts[closed ? (i - 1 + m) % m : Math.max(0, i - 1)];
    const nextP = pts[closed ? (i + 1) % m : Math.min(m - 1, i + 1)];
    const nrm = perp(norm(sub(nextP, prevP)));
    const disp = amount * (rng() * 2 - 1);
    out.push(cornerVertex(add(pts[i], scale(nrm, disp))));
  }
  return { vertices: out, closed };
}

// ── Resolved (numeric) modifier stack — the AnimatableProperty params are evaluated to numbers by
//    the caller (resolveShapeLayer), keeping this module free of the interpolation engine. ──

export type ResolvedShapeModifier =
  | { type: 'trim'; start: number; end: number; offset: number }
  | { type: 'offset'; amount: number }
  | { type: 'roughen'; amount: number; seed: number };

export function applyResolvedModifiers(
  vertices: PathVertex[],
  closed: boolean,
  mods: ResolvedShapeModifier[],
): { vertices: PathVertex[]; closed: boolean } {
  let vs = vertices;
  let cl = closed;
  for (const m of mods) {
    if (vs.length < 2) break;
    if (m.type === 'trim') {
      const r = trimPath(vs, cl, m.start, m.end, m.offset);
      vs = r.vertices; cl = r.closed;
    } else if (m.type === 'offset') {
      vs = offsetPath(vs, cl, m.amount);
    } else if (m.type === 'roughen') {
      const r = roughenPath(vs, cl, m.amount, m.seed);
      vs = r.vertices; cl = r.closed;
    }
  }
  return { vertices: vs, closed: cl };
}
