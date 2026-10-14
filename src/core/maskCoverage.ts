// Mask uniform packing + CPU coverage reference (B10d-mask). The single source of truth for the
// 8-slot mask block every masked draw uploads (rect / text / video / image / pattern pipelines all
// carry `masks: array<MaskSlot, 8>`, 12 floats per slot) and for the coverage the WGSL in
// `engine/maskWgsl.ts` computes from it. `packMaskSlots` writes the block; `maskStackCoverage` is a
// line-for-line CPU twin of the shader, harnessed in node (`verify:mask-coverage`) and checked
// against the real GPU by `npm run gpu:masks`.
//
// Parametric masks (rectangle / ellipse / star / polygon) keep their legacy one-slot layout
// byte-for-byte, so frames without freeform masks upload exactly what they did before.
//
// Freeform (path) masks occupy a RUN of consecutive slots - this is what lets an arbitrary outline
// render with no new bind-group entry, buffer, or pipeline change:
//   header slot   params = (5, invert, opacity, maxFeather)   center = (count, mode)
//                 size = bbox min (x, y)   rot, points = bbox max (x, y)   inner = span (slots)
//   data slots    a flat float stream. mode 0 (bezier): 7 floats per vertex
//                 (x, y, inX, inY, outX, outY, feather) - handle POINTS absolute, composition space.
//                 mode 1 (polyline): 3 floats per point (x, y, feather).
// The shader flattens each cubic adaptively (Wang's bound, FREEFORM_FLATTEN_TOL px, at most
// FREEFORM_MAX_PIECES pieces), takes the nearest-edge distance with a nonzero winding sign, and
// interpolates the feather along that edge. An outline with more vertices than its slot budget is
// reduced (bezier refit or polyline, whichever strays least from the path). Frame-pure.

import type { ResolvedMask, PathVertex, Vec2 } from './types';
import { maskPathToComp } from './maskPath';
import { fitStroke, fitCubicSegment } from './strokeFit';

export const MASK_SLOTS = 8;
export const MASK_SLOT_FLOATS = 12;
export const MASK_BLOCK_FLOATS = MASK_SLOTS * MASK_SLOT_FLOATS;
export const MASK_TYPE_ID: Record<string, number> = { rectangle: 1, ellipse: 2, star: 3, polygon: 4 };
export const FREEFORM_MASK_TYPE = 5;
export const FREEFORM_BEZIER_STRIDE = 7;
export const FREEFORM_POLY_STRIDE = 3;
export const FREEFORM_FLATTEN_TOL = 0.25;
export const FREEFORM_MAX_PIECES = 32;

/** A resolved mask that renders as a freeform outline (has a resolved `vertices` array). */
export function isFreeformResolved(m: ResolvedMask): m is ResolvedMask & { vertices: PathVertex[] } {
  return Array.isArray(m.vertices) && m.vertices.length > 0;
}

/** A freeform outline encoded for the shader. */
export interface PackedFreeform {
  mode: 0 | 1;
  count: number;
  data: number[];
  maxFeather: number;
  bbox: [number, number, number, number];
}

interface FeatherPoint { p: Vec2; f: number }

function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/** Wang's bound: pieces needed so a cubic's chords stay within `tol` (shared with the shader). */
export function cubicPieces(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tol: number, maxPieces: number): number {
  if (p1[0] === p0[0] && p1[1] === p0[1] && p2[0] === p3[0] && p2[1] === p3[1]) return 1;
  const ddx1 = p0[0] - 2 * p1[0] + p2[0], ddy1 = p0[1] - 2 * p1[1] + p2[1];
  const ddx2 = p1[0] - 2 * p2[0] + p3[0], ddy2 = p1[1] - 2 * p2[1] + p3[1];
  const dd = Math.max(Math.hypot(ddx1, ddy1), Math.hypot(ddx2, ddy2));
  return Math.min(maxPieces, Math.max(1, Math.ceil(Math.sqrt((0.75 * dd) / tol))));
}

// Dense, feather-carrying polyline of a closed comp-space outline (no duplicated closing point).
function flattenFeathered(verts: PathVertex[], feathers: number[]): FeatherPoint[] {
  const n = verts.length;
  const out: FeatherPoint[] = [];
  for (let s = 0; s < n; s++) {
    const a = verts[s];
    const b = verts[(s + 1) % n];
    const p0 = a.position;
    const p1: Vec2 = [a.position[0] + a.handleOut[0], a.position[1] + a.handleOut[1]];
    const p2: Vec2 = [b.position[0] + b.handleIn[0], b.position[1] + b.handleIn[1]];
    const p3 = b.position;
    const pieces = cubicPieces(p0, p1, p2, p3, FREEFORM_FLATTEN_TOL, 64);
    const f0 = feathers[s];
    const f1 = feathers[(s + 1) % n];
    for (let j = 0; j < pieces; j++) {
      const t = j / pieces;
      out.push({ p: cubicPoint(p0, p1, p2, p3, t), f: f0 + (f1 - f0) * t });
    }
  }
  return out;
}

function nearestFeather(dense: FeatherPoint[], p: Vec2): number {
  let best = Infinity, f = dense.length > 0 ? dense[0].f : 0;
  for (const d of dense) {
    const e = (d.p[0] - p[0]) ** 2 + (d.p[1] - p[1]) ** 2;
    if (e < best) { best = e; f = d.f; }
  }
  return f;
}

function encodeBezier(verts: PathVertex[], feathers: number[]): PackedFreeform {
  const data: number[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxF = 0;
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  verts.forEach((v, k) => {
    const x = v.position[0], y = v.position[1];
    const ix = x + v.handleIn[0], iy = y + v.handleIn[1];
    const ox = x + v.handleOut[0], oy = y + v.handleOut[1];
    const f = Math.max(0, feathers[k] ?? 0);
    data.push(x, y, ix, iy, ox, oy, f);
    grow(x, y); grow(ix, iy); grow(ox, oy);
    if (f > maxF) maxF = f;
  });
  return { mode: 0, count: verts.length, data, maxFeather: maxF, bbox: [minX, minY, maxX, maxY] };
}

function encodePolyline(points: FeatherPoint[]): PackedFreeform {
  const data: number[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxF = 0;
  for (const { p, f } of points) {
    const ff = Math.max(0, f);
    data.push(p[0], p[1], ff);
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
    if (ff > maxF) maxF = ff;
  }
  return { mode: 1, count: points.length, data, maxFeather: maxF, bbox: [minX, minY, maxX, maxY] };
}

const FIT_TOLERANCES = [0.35, 0.75, 1.5, 3, 6, 12, 24, 48];

const norm2 = (v: Vec2): Vec2 => {
  const l = Math.hypot(v[0], v[1]);
  return l < 1e-12 ? [1, 0] : [v[0] / l, v[1] / l];
};

// The closed polyline the SHADER traces for an encoding (same flattening), for error measurement.
function packedOutline(p: PackedFreeform): Vec2[] {
  const d = p.data;
  const pts: Vec2[] = [];
  if (p.mode === 1) {
    for (let k = 0; k < p.count; k++) pts.push([d[k * FREEFORM_POLY_STRIDE], d[k * FREEFORM_POLY_STRIDE + 1]]);
    return pts;
  }
  for (let k = 0; k < p.count; k++) {
    const a = k * FREEFORM_BEZIER_STRIDE, c = ((k + 1) % p.count) * FREEFORM_BEZIER_STRIDE;
    const p0: Vec2 = [d[a], d[a + 1]], p1: Vec2 = [d[a + 4], d[a + 5]], p2: Vec2 = [d[c + 2], d[c + 3]], p3: Vec2 = [d[c], d[c + 1]];
    const pieces = cubicPieces(p0, p1, p2, p3, FREEFORM_FLATTEN_TOL, FREEFORM_MAX_PIECES);
    for (let j = 0; j < pieces; j++) pts.push(cubicPoint(p0, p1, p2, p3, j / pieces));
  }
  return pts;
}

function distToClosedPolyline(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const ee = ex * ex + ey * ey;
    const t = ee > 1e-12 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / ee)) : 0;
    const d = Math.hypot(p[0] - a[0] - ex * t, p[1] - a[1] - ey * t);
    if (d < best) best = d;
  }
  return best;
}

function subsample(pts: Vec2[], max: number): Vec2[] {
  if (pts.length <= max) return pts;
  const out: Vec2[] = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.floor((i * pts.length) / max)]);
  return out;
}

/** Symmetric max deviation (px) between two closed outlines - how far an encoding strays from the path. */
export function outlineError(a: Vec2[], b: Vec2[]): number {
  const ta = subsample(a, 256), tb = subsample(b, 256);
  let e = 0;
  for (const p of subsample(a, 96)) e = Math.max(e, distToClosedPolyline(p, tb));
  for (const p of subsample(b, 96)) e = Math.max(e, distToClosedPolyline(p, ta));
  return e;
}

// Indices of `k` points spread evenly by arc length along a closed polyline (strictly increasing).
function arcIndices(pts: Vec2[], k: number): number[] | null {
  const n = pts.length;
  if (n < k || k < 3) return null;
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i % n][0] - pts[i - 1][0], pts[i % n][1] - pts[i - 1][1]));
  const total = cum[n];
  if (total <= 1e-9) return null;
  const idx: number[] = [];
  let j = 0;
  for (let i = 0; i < k; i++) {
    const target = (i * total) / k;
    while (j < n - 1 && cum[j + 1] <= target) j++;
    const pick = j + 1 < n && Math.abs(cum[j + 1] - target) < Math.abs(cum[j] - target) ? j + 1 : j;
    const prev = idx.length ? idx[idx.length - 1] : -1;
    idx.push(Math.max(pick, prev + 1));
  }
  return idx[k - 1] < n ? idx : null;
}

// `k` anchors spread by arc length, smooth tangents from the dense outline, least-squares handles per
// segment: a G1 bezier with exactly `k` vertices (the good reduction for smooth, over-dense outlines).
function anchorFit(dense: FeatherPoint[], k: number): PathVertex[] | null {
  const pts = dense.map((d) => d.p);
  const n = pts.length;
  const idx = arcIndices(pts, k);
  if (!idx) return null;
  const tan = idx.map((i) => norm2([pts[(i + 1) % n][0] - pts[(i - 1 + n) % n][0], pts[(i + 1) % n][1] - pts[(i - 1 + n) % n][1]]));
  const verts: PathVertex[] = idx.map((i) => ({ position: [pts[i][0], pts[i][1]], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'smooth' }));
  for (let s = 0; s < k; s++) {
    const i0 = idx[s], i1 = s + 1 < k ? idx[s + 1] : idx[0] + n;
    const seg: Vec2[] = [];
    for (let i = i0; i <= i1; i++) seg.push(pts[i % n]);
    const t2 = tan[(s + 1) % k];
    const bez = fitCubicSegment(seg, tan[s], [-t2[0], -t2[1]]);
    const a = verts[s], b = verts[(s + 1) % k];
    a.handleOut = [bez[1][0] - a.position[0], bez[1][1] - a.position[1]];
    b.handleIn = [bez[2][0] - b.position[0], bez[2][1] - b.position[1]];
  }
  return verts;
}

function arcResample(dense: FeatherPoint[], k: number): FeatherPoint[] | null {
  const idx = arcIndices(dense.map((d) => d.p), k);
  return idx ? idx.map((i) => dense[i]) : null;
}

/**
 * Encode a composition-space outline into at most `dataFloats` floats. Fits as-is when it can (exact
 * beziers). Over budget, several reductions are built - a Schneider refit (M18 fitStroke) at the
 * tightest tolerance that fits, an arc-length anchor fit with least-squares handles, a corner-keeping
 * RDP polyline and an arc-length polyline - and the one whose traced outline strays least from the
 * original wins. Null when nothing with ≥3 points fits.
 */
export function encodeFreeform(compVerts: PathVertex[], feathers: number[], dataFloats: number): PackedFreeform | null {
  if (compVerts.length < 3) return null;
  const capB = Math.floor(dataFloats / FREEFORM_BEZIER_STRIDE);
  const capP = Math.floor(dataFloats / FREEFORM_POLY_STRIDE);
  if (compVerts.length <= capB) return encodeBezier(compVerts, feathers);
  if (capP < 3) return null;

  const dense = flattenFeathered(compVerts, feathers);
  const ref = dense.map((d) => d.p);
  const samples = [...ref, dense[0].p];
  const featherOf = (vs: PathVertex[]) => vs.map((v) => nearestFeather(dense, v.position));
  const candidates: PackedFreeform[] = [];
  if (capB >= 3) {
    for (const tolerance of FIT_TOLERANCES) {
      const fit = fitStroke(samples, { tolerance, closed: true });
      if (fit.vertices.length >= 3 && fit.vertices.length <= capB) {
        candidates.push(encodeBezier(fit.vertices, featherOf(fit.vertices)));
        break;
      }
    }
    const af = anchorFit(dense, capB);
    if (af) candidates.push(encodeBezier(af, featherOf(af)));
  }
  for (const tolerance of FIT_TOLERANCES) {
    const fit = fitStroke(samples, { tolerance, closed: true, mode: 'corner' });
    if (fit.vertices.length >= 3 && fit.vertices.length <= capP) {
      candidates.push(encodePolyline(fit.vertices.map((v) => ({ p: v.position, f: nearestFeather(dense, v.position) }))));
      break;
    }
  }
  const ar = arcResample(dense, Math.min(capP, dense.length));
  if (ar) candidates.push(encodePolyline(ar));
  if (candidates.length === 0) return null;
  let best = candidates[0], bestErr = Infinity;
  for (const c of candidates) {
    const e = outlineError(ref, packedOutline(c));
    if (e < bestErr) { bestErr = e; best = c; }
  }
  return best;
}

// Per-ResolvedMask memo: resolved frames are memoized (TimelineEngine), so paused repaints and loop
// playback hand back the same mask objects - an over-budget refit then runs once per frame, not per draw.
const freeformCache = new WeakMap<ResolvedMask, { dataFloats: number; packed: PackedFreeform | null }>();

/** Encode a resolved freeform mask (local outline → composition space → shader stream). */
export function packFreeformMask(m: ResolvedMask & { vertices: PathVertex[] }, dataFloats: number): PackedFreeform | null {
  const hit = freeformCache.get(m);
  if (hit && hit.dataFloats === dataFloats) return hit.packed;
  const comp = maskPathToComp(m.vertices, { cx: m.centerX, cy: m.centerY, sx: m.sizeX, sy: m.sizeY, rotation: m.rotation });
  const fallback = Math.max(0, m.feather);
  const feathers = comp.map((_, k) => {
    const f = m.feathers?.[k];
    return typeof f === 'number' && Number.isFinite(f) ? Math.max(0, f) : fallback;
  });
  const packed = encodeFreeform(comp, feathers, dataFloats);
  freeformCache.set(m, { dataFloats, packed });
  return packed;
}

/** Slots an outline needs to encode exactly (header + bezier data). */
export function freeformSlotNeed(vertexCount: number): number {
  return 1 + Math.ceil((vertexCount * FREEFORM_BEZIER_STRIDE) / MASK_SLOT_FLOATS);
}

/**
 * Per-mask slot allowance for freeform masks (0 for the rest). Each parametric mask keeps its one slot;
 * what remains is water-filled across the freeform masks by need - smallest need first, each taking
 * at most an equal share of what is left - so a small outline encodes exactly whenever it can and the
 * leftovers go to the bigger ones (which then refit). An allowance under 2 slots (header + data)
 * cannot render and is released to the masks after it.
 */
export function allocateFreeformSlots(masks: ResolvedMask[]): number[] {
  const alloc = new Array<number>(masks.length).fill(0);
  let remaining = MASK_SLOTS - masks.filter((m) => !isFreeformResolved(m)).length;
  const order = masks
    .map((m, i) => ({ i, need: isFreeformResolved(m) && m.vertices.length >= 3 ? freeformSlotNeed(m.vertices.length) : 0 }))
    .filter((e) => e.need > 0)
    .sort((a, b) => a.need - b.need || a.i - b.i);
  let left = order.length;
  for (const { i, need } of order) {
    const share = Math.floor(Math.max(0, remaining) / left);
    left--;
    const a = Math.min(need, share);
    if (a < 2) continue;
    alloc[i] = a;
    remaining -= a;
  }
  return alloc;
}

/**
 * Pack a layer's resolved masks into the 8-slot block at `out[offset .. offset + 96)` and return the
 * slot count (the shader's `maskCount`). Unused slots are zeroed. Parametric masks take one slot each
 * (legacy layout). Each freeform mask takes a header + as many data slots as its outline needs, within
 * its `allocateFreeformSlots` allowance; a freeform outline with fewer than 3 vertices encloses nothing
 * and is skipped. Masks that no longer fit are dropped (as the 9th+ mask always was).
 */
export function packMaskSlots(masks: ResolvedMask[] | undefined, out: Float32Array, offset: number): number {
  for (let j = 0; j < MASK_BLOCK_FLOATS; j++) out[offset + j] = 0;
  if (!masks || masks.length === 0) return 0;
  // Parametric-only stacks (the common case) skip the allocation pass: no per-draw allocations.
  const alloc = masks.some(isFreeformResolved) ? allocateFreeformSlots(masks) : null;
  let slot = 0;
  for (let i = 0; i < masks.length && slot < MASK_SLOTS; i++) {
    const m = masks[i];
    const base = offset + slot * MASK_SLOT_FLOATS;
    if (!isFreeformResolved(m)) {
      out[base] = MASK_TYPE_ID[m.type] ?? 1;
      out[base + 1] = m.invert ? 1 : 0;
      out[base + 2] = m.opacity;
      out[base + 3] = m.feather;
      out[base + 4] = m.centerX;
      out[base + 5] = m.centerY;
      out[base + 6] = m.sizeX * 0.5;
      out[base + 7] = m.sizeY * 0.5;
      out[base + 8] = m.rotation * (Math.PI / 180);
      out[base + 9] = m.points;
      out[base + 10] = m.innerRadius;
      out[base + 11] = 0;
      slot++;
      continue;
    }
    const slots = Math.min(alloc ? alloc[i] : 0, MASK_SLOTS - slot);
    if (slots < 2) continue;
    const packed = packFreeformMask(m, (slots - 1) * MASK_SLOT_FLOATS);
    if (!packed) continue;
    const span = 1 + Math.ceil(packed.data.length / MASK_SLOT_FLOATS);
    out[base] = FREEFORM_MASK_TYPE;
    out[base + 1] = m.invert ? 1 : 0;
    out[base + 2] = m.opacity;
    out[base + 3] = packed.maxFeather;
    out[base + 4] = packed.count;
    out[base + 5] = packed.mode;
    out[base + 6] = packed.bbox[0];
    out[base + 7] = packed.bbox[1];
    out[base + 8] = packed.bbox[2];
    out[base + 9] = packed.bbox[3];
    out[base + 10] = span;
    out[base + 11] = 0;
    const dataBase = base + MASK_SLOT_FLOATS;
    for (let k = 0; k < packed.data.length; k++) out[dataBase + k] = packed.data[k];
    slot += span;
  }
  return slot;
}

// ── CPU twin of engine/maskWgsl.ts (keep in lockstep) ──

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function starSDF(px: number, py: number, points: number, outerR: number, innerR: number): number {
  const pi = 3.14159265;
  const n = Math.max(points, 2);
  const an = pi / n;
  const R = Math.max(outerR, 1e-4);
  const ri = Math.min(R, Math.max(innerR, 1e-4));
  let a = Math.atan2(py, px) + pi * 0.5;
  a = a - 2 * an * Math.floor(a / (2 * an) + 0.5);
  a = Math.abs(a);
  const r = Math.hypot(px, py);
  const qx = r * Math.cos(a), qy = r * Math.sin(a);
  const vOutX = R, vOutY = 0;
  const vInX = ri * Math.cos(an), vInY = ri * Math.sin(an);
  const ex = vInX - vOutX, ey = vInY - vOutY;
  const wx = qx - vOutX, wy = qy - vOutY;
  const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
  const d = Math.hypot(wx - ex * t, wy - ey * t);
  const cr = ex * wy - ey * wx;
  return cr > 0 ? -d : d;
}

function ngonSDF(px: number, py: number, r: number, n: number): number {
  const nn = Math.max(n, 3);
  const an = 3.14159265 / nn;
  const ax = Math.cos(an), ay = Math.sin(an);
  const bn = Math.atan2(px, py);
  const m = bn - 2 * an * Math.floor(bn / (2 * an) + 0.5);
  const len = Math.hypot(px, py);
  let qx = len * Math.cos(m);
  let qy = len * Math.abs(Math.sin(m));
  qx -= r * ax;
  qy -= r * ay;
  qy += Math.min(Math.max(-qy, 0), r * ay);
  return Math.hypot(qx, qy) * Math.sign(qx);
}

function ellipseSDF(px: number, py: number, ax: number, ay: number): number {
  const k1 = Math.hypot(px / ax, py / ay);
  const k2 = Math.hypot(px / (ax * ax), py / (ay * ay));
  return (k1 * (k1 - 1)) / Math.max(k2, 0.0001);
}

function parametricAlpha(b: ArrayLike<number>, o: number, x: number, y: number): number {
  const mtype = Math.round(b[o]);
  if (mtype === 0) return 1;
  const relX = x - b[o + 4], relY = y - b[o + 5];
  const c = Math.cos(-b[o + 8]), s = Math.sin(-b[o + 8]);
  const px = relX * c - relY * s, py = relX * s + relY * c;
  const sx = b[o + 6], sy = b[o + 7];
  let d: number;
  if (mtype === 1) {
    const qx = Math.abs(px) - sx, qy = Math.abs(py) - sy;
    d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  } else if (mtype === 2) {
    d = ellipseSDF(px, py, Math.max(sx, 0.001), Math.max(sy, 0.001));
  } else if (mtype === 3) {
    d = starSDF(px, py, b[o + 9], sx, b[o + 10]);
  } else {
    d = ngonSDF(px, py, sx, b[o + 9]);
  }
  const feather = Math.max(b[o + 3], 0.001);
  let a = 1 - smoothstep(-feather, feather, d);
  if (b[o + 1] > 0.5) a = 1 - a;
  return 1 - b[o + 2] * (1 - a);
}

/** Freeform coverage at (x, y) for the run whose header is at float `o`, plus its signed distance. */
export function freeformCoverage(b: ArrayLike<number>, o: number, x: number, y: number): { alpha: number; signedDist: number } {
  const n = Math.round(b[o + 4]);
  const mode = Math.round(b[o + 5]);
  const maxF = Math.max(b[o + 3], 0.001);
  let minD = 1e30;
  let fAt = maxF;
  let inside = false;
  const outside = x < b[o + 6] - (maxF + 1) || y < b[o + 7] - (maxF + 1) || x > b[o + 8] + (maxF + 1) || y > b[o + 9] + (maxF + 1);
  if (!outside && n >= 3) {
    const d0 = o + MASK_SLOT_FLOATS;
    let winding = 0;
    for (let k = 0; k < n; k++) {
      const k1 = k + 1 >= n ? 0 : k + 1;
      let p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, f0: number, f1: number;
      if (mode === 0) {
        const a = d0 + k * FREEFORM_BEZIER_STRIDE, c = d0 + k1 * FREEFORM_BEZIER_STRIDE;
        p0 = [b[a], b[a + 1]]; p1 = [b[a + 4], b[a + 5]]; p2 = [b[c + 2], b[c + 3]]; p3 = [b[c], b[c + 1]];
        f0 = b[a + 6]; f1 = b[c + 6];
      } else {
        const a = d0 + k * FREEFORM_POLY_STRIDE, c = d0 + k1 * FREEFORM_POLY_STRIDE;
        p0 = [b[a], b[a + 1]]; p3 = [b[c], b[c + 1]]; p1 = p0; p2 = p3;
        f0 = b[a + 2]; f1 = b[c + 2];
      }
      const pieces = cubicPieces(p0, p1, p2, p3, FREEFORM_FLATTEN_TOL, FREEFORM_MAX_PIECES);
      let prev = p0;
      for (let j = 1; j <= pieces; j++) {
        const cur = cubicPoint(p0, p1, p2, p3, j / pieces);
        const ex = cur[0] - prev[0], ey = cur[1] - prev[1];
        const wx = x - prev[0], wy = y - prev[1];
        const ee = ex * ex + ey * ey;
        const tt = ee > 1e-12 ? Math.min(1, Math.max(0, (wx * ex + wy * ey) / ee)) : 0;
        const d = Math.hypot(wx - ex * tt, wy - ey * tt);
        if (d < minD) {
          minD = d;
          fAt = f0 + (f1 - f0) * ((j - 1 + tt) / pieces);
        }
        const isLeft = ex * wy - ey * wx;
        if (prev[1] <= y) {
          if (cur[1] > y && isLeft > 0) winding++;
        } else if (cur[1] <= y && isLeft < 0) {
          winding--;
        }
        prev = cur;
      }
    }
    inside = winding !== 0;
  }
  const sd = inside ? -minD : minD;
  const f = Math.max(fAt, 0.001);
  let a = 1 - smoothstep(-f, f, sd);
  if (b[o + 1] > 0.5) a = 1 - a;
  return { alpha: 1 - b[o + 2] * (1 - a), signedDist: sd };
}

/** The multiplied coverage of a packed mask block at composition point (x, y) - the shader's result. */
export function maskStackCoverage(block: ArrayLike<number>, offset: number, slotCount: number, x: number, y: number): number {
  if (slotCount <= 0) return 1;
  let alpha = 1;
  let i = 0;
  while (i < slotCount && i < MASK_SLOTS) {
    const o = offset + i * MASK_SLOT_FLOATS;
    if (Math.round(block[o]) === FREEFORM_MASK_TYPE) {
      alpha *= freeformCoverage(block, o, x, y).alpha;
      i += Math.max(Math.round(block[o + 10]), 1);
    } else {
      alpha *= parametricAlpha(block, o, x, y);
      i += 1;
    }
  }
  return alpha;
}
