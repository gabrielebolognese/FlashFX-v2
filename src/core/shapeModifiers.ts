// Pure path-modifier operators for shape layers (B8a) - Trim Paths (draw-on), Offset Paths
// (inset/outset), and Roughen (jagged edges). Each is a deterministic PathVertex[] → PathVertex[]
// transform applied at RESOLVE time (see resolveShapeLayer), so the already-existing polygon
// tessellation pipeline draws the result with NO renderer change. A leaf module: it imports only
// `evalCubic` (itself pure) + types, so it bundles in a node harness (`verify:shape-motion`).
//
// Modifiers are OPT-IN: with none present the resolver returns the original vertices untouched, so
// existing shapes are byte-identical. Trim/Roughen emit a flattened polyline (corner vertices) - the
// tessellator flattens beziers anyway, so the rendered result matches a curve-preserving trim while
// keeping the maths robust and testable. Offset preserves vertex count and relative handles.

import type { Vec2, PathVertex, PathKeyframe } from './types';
import { evalCubic } from './bend';
import { applyEasing, cubicBezier } from './easings';

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

function clonePathVertex(v: PathVertex): PathVertex {
  return {
    position: [v.position[0], v.position[1]],
    handleIn: [v.handleIn[0], v.handleIn[1]],
    handleOut: [v.handleOut[0], v.handleOut[1]],
    vertexType: v.vertexType,
    ...(v.handleMode ? { handleMode: v.handleMode } : {}),
  };
}

function centroidOf(vertices: PathVertex[]): Vec2 {
  let cx = 0, cy = 0;
  for (const v of vertices) { cx += v.position[0]; cy += v.position[1]; }
  return [cx / vertices.length, cy / vertices.length];
}

/** Deterministic PRNG (house mulberry32) - Roughen must be frame-pure, so no Math.random/Date. */
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
 * no modifier. Empty window returns no vertices (nothing drawn - a 0% draw-on).
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
    // periodic ring - normalize the start into [0,1); the window may cross the seam.
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
 * Dash a path (B8c) - split the outline into the "on" segments of a dash pattern, each returned as its
 * own open polyline contour (so the renderer strokes each piece). `dashArray` is [on, off, on, off, …]
 * lengths in px (an odd-length array is doubled, SVG-style); `dashOffset` shifts the pattern along the
 * path (the pattern position at arc 0 is `dashOffset`). An empty/zero pattern returns the whole path as
 * one contour (no dashing). Pure arc-length walk - mirrors trim; the fill is unaffected (stroke only).
 */
/**
 * B67 - trim start angle: the arc-length fraction (0..1, measured from vertex 0 along the path) where a
 * ray from the path's bounding-box centre at `angleDeg` meets the outline. Clock convention, Y-down
 * comp space: 0 = 12 o'clock, 90 = 3 o'clock, clockwise. Set a trim's start + offset to this value and
 * a ring draws on from that angle (AE rings usually start at 12 o'clock; vertex 0 of a converted
 * circle sits elsewhere). Pure; ~1/256 of the perimeter resolution, below a pixel on a 1080 ring.
 */
export function pathFractionAtAngle(vertices: PathVertex[], closed: boolean, angleDeg: number): number {
  if (vertices.length < 2) return 0;
  const { pts, cum, total } = flattenAll(vertices, closed, 64);
  if (total <= 0 || pts.length === 0) return 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const q of pts) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const c: Vec2 = [(minX + maxX) / 2, (minY + maxY) / 2];
  const a = (angleDeg * Math.PI) / 180;
  const dir: Vec2 = [Math.sin(a), -Math.cos(a)];
  let best = 0, bestDot = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = norm(sub(pts[i], c));
    const dot = d[0] * dir[0] + d[1] * dir[1];
    if (dot > bestDot) { bestDot = dot; best = i; }
  }
  const f = cum[best] / total;
  return f >= 1 - 1e-9 ? 0 : f;
}

export function dashPath(vertices: PathVertex[], closed: boolean, dashArray: number[], dashOffset: number, perSeg = 24): PathVertex[][] {
  if (vertices.length < 2) return [vertices.map(clonePathVertex)];
  let pattern = dashArray.filter((d) => Number.isFinite(d) && d > 0);
  if (pattern.length === 0) return [vertices.map(clonePathVertex)];
  if (pattern.length % 2 === 1) pattern = pattern.concat(pattern); // SVG: odd arrays repeat
  const P = pattern.reduce((a, b) => a + b, 0);
  if (P <= 0) return [vertices.map(clonePathVertex)];

  const { pts, cum, total } = flattenAll(vertices, closed, perSeg);
  if (total <= 0) return [];

  // Arc where pattern index 0 begins, in (−P, 0], so the walk covers all of [0, total].
  let arc = -(((dashOffset % P) + P) % P);
  let idx = 0;
  const out: PathVertex[][] = [];
  while (arc < total) {
    const elemLen = pattern[idx % pattern.length];
    const segEnd = arc + elemLen;
    if (idx % 2 === 0) { // "on"
      const a = Math.max(0, arc);
      const b = Math.min(total, segEnd);
      if (b > a + 1e-6) out.push(collectContiguous(pts, cum, a, b).map(cornerVertex));
    }
    arc = segEnd;
    idx++;
  }
  return out;
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

  // centroid (of anchor positions) - used to orient every normal outward, winding-agnostic.
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
  // For a closed ring the last point duplicates the first - drop it and let `closed` re-close.
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

/**
 * Pucker & Bloat. Bows each edge outward (bloat, amount > 0) or inward (pucker, amount < 0) while the
 * original ANCHORS stay put - the distinguishing look vs. a plain scale (flowers / spikes). Implemented
 * by subdividing each segment and pushing every sample along its outward normal by
 * `amount · sin(π·tLocal)`, which is 0 at the anchors and peaks at the edge midpoints. Emits a
 * flattened polyline. `amount = 0` is a no-op.
 */
export function puckerBloat(vertices: PathVertex[], closed: boolean, amount: number, perSeg = 12): { vertices: PathVertex[]; closed: boolean } {
  const n = vertices.length;
  if (amount === 0 || n < 2) return { vertices: vertices.map(clonePathVertex), closed };
  const centroid = centroidOf(vertices);
  const segCount = closed ? n : n - 1;

  // Subdivide, tracking each sample's within-segment parameter (0 at anchors).
  const pts: Vec2[] = [[vertices[0].position[0], vertices[0].position[1]]];
  const tLoc: number[] = [0];
  for (let s = 0; s < segCount; s++) {
    const a = vertices[s];
    const b = vertices[(s + 1) % n];
    for (let k = 1; k <= perSeg; k++) {
      pts.push(evalCubic(a, b, k / perSeg));
      tLoc.push(k / perSeg); // k === perSeg → 1 → an anchor → sin(π)=0
    }
  }
  // For a closed ring the final sample duplicates the first anchor - drop it (closed re-closes).
  const usePts = closed ? pts.slice(0, -1) : pts;
  const useT = closed ? tLoc.slice(0, -1) : tLoc;
  const m = usePts.length;

  const out: PathVertex[] = [];
  for (let i = 0; i < m; i++) {
    const prevP = usePts[closed ? (i - 1 + m) % m : Math.max(0, i - 1)];
    const nextP = usePts[closed ? (i + 1) % m : Math.min(m - 1, i + 1)];
    let nrm = perp(norm(sub(nextP, prevP)));
    const away = sub(usePts[i], centroid);
    if (nrm[0] * away[0] + nrm[1] * away[1] < 0) nrm = [-nrm[0], -nrm[1]]; // outward
    const disp = amount * Math.sin(Math.PI * useT[i]);
    out.push(cornerVertex(add(usePts[i], scale(nrm, disp))));
  }
  return { vertices: out, closed };
}

// ── Shape morph / keyframable path (B8b) ──

/** Resample a path to exactly N points spaced evenly by arc length (implicit index correspondence). */
function resampleToN(vertices: PathVertex[], closed: boolean, N: number): Vec2[] {
  if (vertices.length === 1 || N < 2) {
    const p = vertices[0]?.position ?? [0, 0];
    return Array.from({ length: Math.max(1, N) }, () => [p[0], p[1]] as Vec2);
  }
  const { pts, cum, total } = flattenAll(vertices, closed, 24);
  const out: Vec2[] = [];
  for (let i = 0; i < N; i++) {
    const frac = closed ? i / N : i / (N - 1);
    out.push(pointAtLen(pts, cum, frac * total));
  }
  return out;
}

/**
 * Morph between two path poses at t∈[0,1]. Both poses are arc-length-resampled to a common point count
 * (so different vertex counts morph) and interpolated index-for-index. Emits a flattened polyline.
 */
export function morphPaths(vA: PathVertex[], cA: boolean, vB: PathVertex[], cB: boolean, t: number, align = false): { vertices: PathVertex[]; closed: boolean } {
  const N = Math.max(8, Math.min(256, Math.max(vA.length, vB.length) * 8));
  const A = resampleToN(vA, cA, N);
  let B = resampleToN(vB, cB, N);
  if (align && cA && cB) B = alignRing(A, B);
  const out: PathVertex[] = [];
  for (let i = 0; i < N; i++) {
    out.push(cornerVertex([A[i][0] + (B[i][0] - A[i][0]) * t, A[i][1] + (B[i][1] - A[i][1]) * t]));
  }
  return { vertices: out, closed: t < 0.5 ? cA : cB };
}

/**
 * B62: re-index closed ring B (same point count as A) so it starts at the point and runs in the winding
 * that best matches A - minimum summed squared distance over every cyclic shift, forward and reversed.
 * Removes the twist a rect -> circle (or any two outlines with different start points) morph shows
 * with plain index-0 correspondence. Deterministic (ties keep the lowest shift, forward first).
 */
export function alignRing(A: Vec2[], B: Vec2[]): Vec2[] {
  const n = A.length;
  if (n !== B.length || n < 3) return B;
  let best = Infinity, bestShift = 0, bestRev = false;
  for (const rev of [false, true]) {
    for (let s = 0; s < n; s++) {
      let d = 0;
      for (let i = 0; i < n && d < best; i++) {
        const j = rev ? (s - i + n) % n : (s + i) % n;
        const dx = A[i][0] - B[j][0], dy = A[i][1] - B[j][1];
        d += dx * dx + dy * dy;
      }
      if (d < best) { best = d; bestShift = s; bestRev = rev; }
    }
  }
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) out.push(B[bestRev ? (bestShift - i + n) % n : (bestShift + i) % n]);
  return out;
}

/** B62: eased morph progress for a pose's ease (named or cubic-bezier quad; absent = linear). */
export function morphProgress(ease: PathKeyframe['ease'], t: number): number {
  if (!ease) return t;
  if (Array.isArray(ease)) return cubicBezier(t, ease[0], ease[1], ease[2], ease[3]);
  return applyEasing(ease, t);
}

/**
 * Evaluate an animated outline at `frame`. At or beyond a pose (and outside the range) returns that
 * pose's ORIGINAL vertices - beziers intact, byte-identical to the authored shape. Strictly BETWEEN
 * two poses returns a morphed polyline. `hold` interpolation on a pose freezes it until the next.
 */
export function evalPathKeyframes(kfs: PathKeyframe[], frame: number): { vertices: PathVertex[]; closed: boolean; holes?: PathVertex[][] } {
  const main = evalMainContour(kfs, frame);
  // B83: extra contours only when a pose carries them (else the caller keeps the static holes).
  if (!kfs.some((k) => Array.isArray(k.holes) && k.holes.length > 0)) return main;
  return { ...main, holes: evalPathHoles(kfs, frame) };
}

function evalMainContour(kfs: PathKeyframe[], frame: number): { vertices: PathVertex[]; closed: boolean } {
  const clone = (k: PathKeyframe) => ({ vertices: k.vertices.map(clonePathVertex), closed: k.closed });
  if (kfs.length === 0) return { vertices: [], closed: false };
  if (kfs.length === 1 || frame <= kfs[0].frame) return clone(kfs[0]);
  if (frame >= kfs[kfs.length - 1].frame) return clone(kfs[kfs.length - 1]);

  let i = 0;
  for (let j = 0; j < kfs.length - 1; j++) {
    if (frame >= kfs[j].frame && frame <= kfs[j + 1].frame) { i = j; break; }
  }
  const k0 = kfs[i];
  const k1 = kfs[i + 1];
  if (frame === k0.frame || k0.interpolation === 'hold') return clone(k0);
  if (frame === k1.frame) return clone(k1);
  const span = k1.frame - k0.frame;
  const t = span <= 0 ? 0 : (frame - k0.frame) / span;
  if (k0.align === 'vertices' && k0.vertices.length === k1.vertices.length) {
    return { vertices: lerpVertices(k0.vertices, k1.vertices, morphProgress(k0.ease, t)), closed: k0.closed };
  }
  // 'vertices' with different counts falls back to the matched (B62 auto) arc-length morph.
  return morphPaths(k0.vertices, k0.closed, k1.vertices, k1.closed, morphProgress(k0.ease, t), k0.align === 'auto' || k0.align === 'vertices');
}

// ── B83: multi-contour morph (holes + islands) ──

function flatRing(vs: PathVertex[]): Vec2[] {
  if (vs.length < 2) return vs.map((v) => [v.position[0], v.position[1]] as Vec2);
  const { pts } = flattenAll(vs, true, 8);
  return pts.slice(0, -1);
}

function ringArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

function ringCentroid(pts: Vec2[]): Vec2 {
  const a = ringArea(pts);
  if (Math.abs(a) < 1e-9) {
    let x = 0, y = 0;
    for (const p of pts) { x += p[0]; y += p[1]; }
    return pts.length ? [x / pts.length, y / pts.length] : [0, 0];
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Even-odd point-in-polygon on a flattened ring. */
export function pointInRing(pt: Vec2, ring: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1] + 1e-300) + a[0]) inside = !inside;
  }
  return inside;
}

/**
 * Nesting depth of each contour among `rings` (how many OTHER rings contain its first point). Even
 * depth = filled (an outer or an island), odd = a hole: the even-odd rule, contour by contour.
 */
export function contourDepths(rings: Vec2[][]): number[] {
  return rings.map((r, i) => {
    if (r.length === 0) return 0;
    // Probe a point just inside the ring's own area: its first point would sit ON the ring.
    const probe = r[0];
    let d = 0;
    for (let j = 0; j < rings.length; j++) if (j !== i && rings[j].length >= 3 && pointInRing(probe, rings[j])) d++;
    return d;
  });
}

function scaleAbout(vs: PathVertex[], c: Vec2, f: number): PathVertex[] {
  return vs.map((v) => ({
    position: [c[0] + (v.position[0] - c[0]) * f, c[1] + (v.position[1] - c[1]) * f] as Vec2,
    handleIn: [v.handleIn[0] * f, v.handleIn[1] * f] as Vec2,
    handleOut: [v.handleOut[0] * f, v.handleOut[1] * f] as Vec2,
    vertexType: v.vertexType,
  }));
}

export interface ContourInfo { vs: PathVertex[]; c: Vec2; area: number; filled: boolean }

function contourInfos(main: PathVertex[], holes: PathVertex[][]): ContourInfo[] {
  const rings = [flatRing(main), ...holes.map(flatRing)];
  const depth = contourDepths(rings);
  return holes.map((vs, i) => {
    const r = rings[i + 1];
    return { vs, c: ringCentroid(r), area: Math.abs(ringArea(r)), filled: depth[i + 1] % 2 === 0 };
  });
}

/**
 * B83: pair the extra contours of two poses. Greedy on a cost of centre distance (relative to the
 * pose size) plus an area-ratio term; only contours of the same kind pair (hole with hole, island
 * with island) so the fill never flips mid-morph. Deterministic (ties keep the lower indices).
 */
export function pairContours(a: ContourInfo[], b: ContourInfo[], size: number): Array<[number, number]> {
  const cand: Array<{ i: number; j: number; cost: number }> = [];
  const s = Math.max(size, 1e-6);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    if (a[i].filled !== b[j].filled) continue;
    const d = Math.hypot(a[i].c[0] - b[j].c[0], a[i].c[1] - b[j].c[1]) / s;
    const r = Math.abs(Math.log((a[i].area + 1e-6) / (b[j].area + 1e-6)));
    cand.push({ i, j, cost: d + 0.25 * r });
  }
  cand.sort((x, y) => x.cost - y.cost || x.i - y.i || x.j - y.j);
  const usedA = new Set<number>(), usedB = new Set<number>();
  const out: Array<[number, number]> = [];
  for (const c of cand) {
    if (usedA.has(c.i) || usedB.has(c.j)) continue;
    usedA.add(c.i); usedB.add(c.j);
    out.push([c.i, c.j]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

function poseSize(vs: PathVertex[]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vs) {
    if (v.position[0] < minX) minX = v.position[0]; if (v.position[0] > maxX) maxX = v.position[0];
    if (v.position[1] < minY) minY = v.position[1]; if (v.position[1] > maxY) maxY = v.position[1];
  }
  return vs.length ? Math.hypot(maxX - minX, maxY - minY) : 1;
}

/**
 * B83: the extra contours (holes / islands) of an animated outline at `frame`. At a pose: that pose's
 * own contours (bezier intact). Between poses: paired contours morph (matched start point and
 * winding); an unpaired contour of the first pose shrinks into its own centre, one of the second pose
 * grows out of its centre. align 'vertices' with identical contour and vertex counts morphs vertex for
 * vertex, like the main contour.
 */
export function evalPathHoles(kfs: PathKeyframe[], frame: number): PathVertex[][] {
  const hs = (k: PathKeyframe): PathVertex[][] => (k.holes ?? []).map((h) => h.map(clonePathVertex));
  if (kfs.length === 0) return [];
  if (kfs.length === 1 || frame <= kfs[0].frame) return hs(kfs[0]);
  const last = kfs[kfs.length - 1];
  if (frame >= last.frame) return hs(last);
  let i = 0;
  for (let j = 0; j < kfs.length - 1; j++) if (frame >= kfs[j].frame && frame <= kfs[j + 1].frame) { i = j; break; }
  const k0 = kfs[i], k1 = kfs[i + 1];
  if (frame === k0.frame || k0.interpolation === 'hold') return hs(k0);
  if (frame === k1.frame) return hs(k1);
  const span = k1.frame - k0.frame;
  const p = morphProgress(k0.ease, span <= 0 ? 0 : (frame - k0.frame) / span);
  const A = k0.holes ?? [], B = k1.holes ?? [];
  if (k0.align === 'vertices' && A.length === B.length && A.every((h, n) => h.length === B[n].length)) {
    return A.map((h, n) => lerpVertices(h, B[n], p));
  }
  const ia = contourInfos(k0.vertices, A), ib = contourInfos(k1.vertices, B);
  const pairs = pairContours(ia, ib, Math.max(poseSize(k0.vertices), poseSize(k1.vertices)));
  const out: PathVertex[][] = [];
  const pairedA = new Map(pairs.map(([x, y]) => [x, y]));
  const pairedB = new Set(pairs.map(([, y]) => y));
  for (let a = 0; a < A.length; a++) {
    const b = pairedA.get(a);
    if (b !== undefined) out.push(morphPaths(A[a], true, B[b], true, p, true).vertices);
    else if (p < 1) out.push(scaleAbout(A[a], ia[a].c, 1 - p));
  }
  for (let b = 0; b < B.length; b++) if (!pairedB.has(b) && p > 0) out.push(scaleAbout(B[b], ib[b].c, p));
  return out;
}

/** B76: index-for-index vertex interpolation (positions and bezier handles), keeping vertex types of `a`. */
export function lerpVertices(a: PathVertex[], b: PathVertex[], t: number): PathVertex[] {
  const l = (x: number, y: number): number => x + (y - x) * t;
  return a.map((v, i) => {
    const w = b[i];
    return {
      position: [l(v.position[0], w.position[0]), l(v.position[1], w.position[1])],
      handleIn: [l(v.handleIn[0], w.handleIn[0]), l(v.handleIn[1], w.handleIn[1])],
      handleOut: [l(v.handleOut[0], w.handleOut[0]), l(v.handleOut[1], w.handleOut[1])],
      vertexType: v.vertexType,
      ...(v.handleMode ? { handleMode: v.handleMode } : {}),
    };
  });
}

/**
 * B76: the LOGICAL anchor positions of an animated outline at `frame` (layer-local): the same-index pose
 * vertices interpolated on the pose ease, whatever the drawn morph does in between (the arc-length morph
 * resamples, so its points are not anchors). Null when the two poses around `frame` differ in vertex count.
 */
export function evalPathAnchors(kfs: PathKeyframe[], frame: number): Vec2[] | null {
  if (kfs.length === 0) return null;
  const pos = (vs: PathVertex[]): Vec2[] => vs.map((v) => [v.position[0], v.position[1]]);
  if (kfs.length === 1 || frame <= kfs[0].frame) return pos(kfs[0].vertices);
  const last = kfs[kfs.length - 1];
  if (frame >= last.frame) return pos(last.vertices);
  let i = 0;
  for (let j = 0; j < kfs.length - 1; j++) if (frame >= kfs[j].frame && frame <= kfs[j + 1].frame) { i = j; break; }
  const k0 = kfs[i], k1 = kfs[i + 1];
  if (frame === k0.frame || k0.interpolation === 'hold') return pos(k0.vertices);
  if (frame === k1.frame) return pos(k1.vertices);
  if (k0.vertices.length !== k1.vertices.length) return null;
  const span = k1.frame - k0.frame;
  const e = morphProgress(k0.ease, span <= 0 ? 0 : (frame - k0.frame) / span);
  return k0.vertices.map((v, n): Vec2 => [v.position[0] + (k1.vertices[n].position[0] - v.position[0]) * e, v.position[1] + (k1.vertices[n].position[1] - v.position[1]) * e]);
}

// ── In-shape Repeater (B8d) ──

export interface RepeaterCopy {
  dx: number;       // accumulated position offset from the base (comp space)
  dy: number;
  rotation: number; // added rotation in degrees
  scale: number;    // multiplicative scale factor
  opacity: number;  // multiplicative opacity (start→end ramp across copies)
}

/**
 * Per-copy transforms for a shape Repeater (AE Repeater / MoGraph clone-in-place). Copy 0 is the
 * original (no offset). Each subsequent copy accumulates the per-copy delta UNDER the growing
 * rotation+scale - i.e. copy i's offset is Σ_{k<i} scale^k · R(k·rot) · (offsetX, offsetY) - so a
 * rotation makes copies fan into a radial array and a scale makes a spiral, exactly like AE. Opacity
 * ramps linearly from `startOpacity` (copy 0) to `endOpacity` (last copy). Pure & deterministic.
 */
export function repeaterTransforms(
  count: number,
  offsetX: number,
  offsetY: number,
  rotationDeg: number,
  scaleFactor: number,
  startOpacity: number,
  endOpacity: number,
): RepeaterCopy[] {
  const n = Math.max(0, Math.floor(count));
  const out: RepeaterCopy[] = [];
  let px = 0, py = 0, curRot = 0, curScale = 1;
  const rotStep = (rotationDeg * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const opacity = n > 1 ? startOpacity + (endOpacity - startOpacity) * (i / (n - 1)) : startOpacity;
    out.push({ dx: px, dy: py, rotation: rotationDeg * i, scale: curScale, opacity });
    px += curScale * (Math.cos(curRot) * offsetX - Math.sin(curRot) * offsetY);
    py += curScale * (Math.sin(curRot) * offsetX + Math.cos(curRot) * offsetY);
    curRot += rotStep;
    curScale *= scaleFactor;
  }
  return out;
}

// ── Resolved (numeric) modifier stack - the AnimatableProperty params are evaluated to numbers by
//    the caller (resolveShapeLayer), keeping this module free of the interpolation engine. ──

export type ResolvedShapeModifier =
  | { type: 'trim'; start: number; end: number; offset: number }
  | { type: 'offset'; amount: number }
  | { type: 'roughen'; amount: number; seed: number }
  | { type: 'puckerBloat'; amount: number };

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
    } else if (m.type === 'puckerBloat') {
      const r = puckerBloat(vs, cl, m.amount);
      vs = r.vertices; cl = r.closed;
    }
  }
  return { vertices: vs, closed: cl };
}
