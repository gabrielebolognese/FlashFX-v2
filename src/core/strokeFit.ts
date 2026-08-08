import type { Vec2, PathVertex } from './types';

// M18 — Pencil / freehand tool. Pure stroke fitting: raw pointer samples → editable cubic
// PathVertex[] via RDP pre-decimation + Schneider least-squares curve fitting ("An Algorithm for
// Automatically Fitting Digitized Curves", Graphics Gems I). Smooth joints get vertexType
// 'smooth' + handleMode 'angle' (G1, independent handle lengths) so M8's vector-edit keeps the
// fitted tangents. Dependency-free (only ./types), deterministic (no Math.random/Date), every
// emitted number normalized with `+ 0`. Proven by scripts/verify-strokefit.mjs.

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const norm = (v: Vec2): Vec2 => { const l = Math.hypot(v[0], v[1]); return l < 1e-12 ? [0, 0] : [v[0] / l, v[1] / l]; };
const isZero = (v: Vec2): boolean => v[0] === 0 && v[1] === 0;
const z = (v: Vec2): Vec2 => [v[0] + 0, v[1] + 0];

/** De Casteljau evaluation of a bezier of any degree at t. */
function bezierAt(pts: Vec2[], t: number): Vec2 {
  const tmp = pts.map((p) => [p[0], p[1]] as Vec2);
  for (let k = 1; k < pts.length; k++) {
    for (let i = 0; i < pts.length - k; i++) {
      tmp[i] = [tmp[i][0] + (tmp[i + 1][0] - tmp[i][0]) * t, tmp[i][1] + (tmp[i + 1][1] - tmp[i][1]) * t];
    }
  }
  return tmp[0];
}

// ── RDP over raw Vec2 (own impl — pathOps' RDP works on PathVertex and pulls heavy imports) ──
function perpDistSq(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const cx = a[0] + t * dx, cy = a[1] + t * dy;
  return (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
}
function rdp(points: Vec2[], tol: number): Vec2[] {
  const n = points.length;
  if (n <= 2 || tol <= 0) return points.slice();
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = keep[n - 1] = true;
  const tolSq = tol * tol;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistSq(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolSq && idx > 0) { keep[idx] = true; stack.push([s, idx], [idx, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

// ── Schneider curve fit → array of cubics [P0, c1, c2, P3] ──
function chordParam(d: Vec2[]): number[] {
  const u = [0];
  for (let i = 1; i < d.length; i++) u[i] = u[i - 1] + dist(d[i], d[i - 1]);
  const total = u[u.length - 1] || 1;
  return u.map((x) => x / total);
}

function generateBezier(d: Vec2[], u: number[], tHat1: Vec2, tHat2: Vec2): Vec2[] {
  const n = d.length;
  const A: [Vec2, Vec2][] = u.map((ui) => [scale(tHat1, 3 * ui * (1 - ui) * (1 - ui)), scale(tHat2, 3 * ui * ui * (1 - ui))]);
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
  for (let i = 0; i < n; i++) {
    c00 += dot(A[i][0], A[i][0]);
    c01 += dot(A[i][0], A[i][1]);
    c11 += dot(A[i][1], A[i][1]);
    const ui = u[i], uu = 1 - ui;
    const b0 = uu * uu * uu, b1 = 3 * uu * uu * ui, b2 = 3 * uu * ui * ui, b3 = ui * ui * ui;
    const ref = add(scale(d[0], b0 + b1), scale(d[n - 1], b2 + b3));
    const tmp = sub(d[i], ref);
    x0 += dot(A[i][0], tmp);
    x1 += dot(A[i][1], tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let a1 = Math.abs(det) < 1e-12 ? 0 : (x0 * c11 - c01 * x1) / det;
  let a2 = Math.abs(det) < 1e-12 ? 0 : (c00 * x1 - c01 * x0) / det;
  const segLen = dist(d[0], d[n - 1]);
  const eps = 1e-6 * segLen;
  if (a1 < eps || a2 < eps) { a1 = a2 = segLen / 3; } // Wu/Barsky fallback
  return [d[0], add(d[0], scale(tHat1, a1)), add(d[n - 1], scale(tHat2, a2)), d[n - 1]];
}

function maxErrorSq(d: Vec2[], bez: Vec2[], u: number[]): { errSq: number; split: number } {
  let errSq = 0, split = Math.floor(d.length / 2);
  for (let i = 1; i < d.length - 1; i++) {
    const p = bezierAt(bez, u[i]);
    const e = (p[0] - d[i][0]) ** 2 + (p[1] - d[i][1]) ** 2;
    if (e >= errSq) { errSq = e; split = i; }
  }
  return { errSq, split };
}

function newtonStep(bez: Vec2[], p: Vec2, u: number): number {
  const q1 = [0, 1, 2].map((i) => scale(sub(bez[i + 1], bez[i]), 3)); // 1st-deriv control pts (deg 2)
  const q2 = [0, 1].map((i) => scale(sub(q1[i + 1], q1[i]), 2));      // 2nd-deriv (deg 1)
  const qu = bezierAt(bez, u), q1u = bezierAt(q1, u), q2u = bezierAt(q2, u);
  const num = dot(sub(qu, p), q1u);
  const den = dot(q1u, q1u) + dot(sub(qu, p), q2u);
  return den === 0 ? u : u - num / den;
}

function fitCubic(d: Vec2[], tHat1: Vec2, tHat2: Vec2, errSq: number): Vec2[][] {
  if (d.length === 2) {
    const l = dist(d[0], d[1]) / 3;
    return [[d[0], add(d[0], scale(tHat1, l)), add(d[1], scale(tHat2, l)), d[1]]];
  }
  let u = chordParam(d);
  let bez = generateBezier(d, u, tHat1, tHat2);
  let { errSq: err, split } = maxErrorSq(d, bez, u);
  if (err < errSq) return [bez];
  if (err < errSq * 4) {
    for (let it = 0; it < 4; it++) {
      const uPrime = u.map((ui, i) => newtonStep(bez, d[i], ui));
      bez = generateBezier(d, uPrime, tHat1, tHat2);
      ({ errSq: err, split } = maxErrorSq(d, bez, uPrime));
      u = uPrime;
      if (err < errSq) return [bez];
    }
  }
  const tHatC = norm(sub(d[split - 1], d[split + 1]));
  return [
    ...fitCubic(d.slice(0, split + 1), tHat1, tHatC, errSq),
    ...fitCubic(d.slice(split), scale(tHatC, -1), tHat2, errSq),
  ];
}

function corner(p: Vec2): PathVertex {
  return { position: z(p), handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' };
}

/** A cubic whose controls sit on the P0→P3 line is a straight segment — emit corner handles so
 *  it reads/edits as a line, not a bezier. */
function isStraightCubic(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2): boolean {
  const eps = 1e-4 * (dist(p0, p3) + 1);
  const epsSq = eps * eps;
  return perpDistSq(c1, p0, p3) <= epsSq && perpDistSq(c2, p0, p3) <= epsSq;
}

/** Convert a list of cubics [P0,c1,c2,P3] (endpoints shared between consecutive cubics) into
 *  PathVertex[] with relative handles; joints are 'smooth' + 'angle'. */
function cubicsToVertices(cubics: Vec2[][], closed: boolean): PathVertex[] {
  if (cubics.length === 0) return [];
  const verts: PathVertex[] = [];
  cubics.forEach((c, k) => {
    const [p0, c1, c2, p3] = c;
    const str = isStraightCubic(p0, c1, c2, p3);
    const outH: Vec2 = str ? [0, 0] : z(sub(c1, p0));
    if (k === 0) {
      verts.push({ position: z(p0), handleIn: [0, 0], handleOut: outH, vertexType: isZero(outH) ? 'corner' : 'bezier' });
    } else {
      const last = verts[verts.length - 1];
      last.handleOut = outH;
      if (!isZero(last.handleIn) && !isZero(last.handleOut)) { last.vertexType = 'smooth'; last.handleMode = 'angle'; }
    }
    const inH: Vec2 = str ? [0, 0] : z(sub(c2, p3));
    verts.push({ position: z(p3), handleIn: inH, handleOut: [0, 0], vertexType: isZero(inH) ? 'corner' : 'bezier' });
  });
  if (closed && verts.length > 2) {
    const first = verts[0], last = verts[verts.length - 1];
    first.handleIn = [last.handleIn[0], last.handleIn[1]];
    if (!isZero(first.handleIn) && !isZero(first.handleOut)) { first.vertexType = 'smooth'; first.handleMode = 'angle'; }
    verts.pop();
  }
  return verts;
}

export interface FitStrokeOptions {
  tolerance?: number;        // max fit error in COMP units (default 2.5)
  mode?: 'curve' | 'corner'; // Schneider bezier fit (default) vs pure RDP corners
  straight?: boolean;        // collapse to one straight segment (Shift)
  closed?: boolean;          // caller-detected close (endpoints coincide)
  rdpFactor?: number;        // RDP pre-decimation tolerance = tolerance*rdpFactor (default 0.5)
  dedupeEps?: number;        // drop samples closer than this (default 0.5)
}
export interface FitStrokeResult { vertices: PathVertex[]; closed: boolean }

function dedupe(samples: Vec2[], eps: number): Vec2[] {
  const out: Vec2[] = [];
  for (const p of samples) { const q = out[out.length - 1]; if (!q || dist(p, q) >= eps) out.push(p); }
  return out;
}

/** Fit a freehand pointer stroke into an editable path. */
export function fitStroke(samples: Vec2[], opts: FitStrokeOptions = {}): FitStrokeResult {
  const tol = opts.tolerance ?? 2.5;
  const pts = dedupe(samples, opts.dedupeEps ?? 0.5);
  if (pts.length < 2) return { vertices: [], closed: false };

  if (opts.straight) return { vertices: [corner(pts[0]), corner(pts[pts.length - 1])], closed: false };

  if (opts.mode === 'corner') {
    const simplified = rdp(pts, tol);
    const verts = simplified.map(corner);
    if (opts.closed && verts.length > 2) verts.pop();
    return { vertices: verts, closed: !!opts.closed };
  }

  // Curve mode: RDP pre-pass then Schneider fit.
  let d = rdp(pts, tol * (opts.rdpFactor ?? 0.5));
  if (d.length < 2) d = pts;
  const cubics = d.length === 2
    ? fitCubic(d, norm(sub(d[1], d[0])), norm(sub(d[0], d[1])), tol * tol)
    : fitCubic(d, norm(sub(d[1], d[0])), norm(sub(d[d.length - 2], d[d.length - 1])), tol * tol);
  return { vertices: cubicsToVertices(cubics, !!opts.closed), closed: !!opts.closed };
}
