import type { Vec2, PathVertex } from './types';

// Pure path-cleanup ops for M10: delete-and-heal an anchor, and join/close paths.
// Dependency-free + deterministic (scripts/verify-pathcleanup.mjs).

const isCorner = (v: PathVertex) =>
  v.handleOut[0] === 0 && v.handleOut[1] === 0 && v.handleIn[0] === 0 && v.handleIn[1] === 0;

function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v[0], v[1]);
  return l < 1e-9 ? [0, 0] : [v[0] / l, v[1] / l];
}
/** Cubic point from absolute control points. */
function cubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t, b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
  return [b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0], b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]];
}

function clone(v: PathVertex): PathVertex {
  return {
    position: [v.position[0], v.position[1]],
    handleIn: [v.handleIn[0], v.handleIn[1]],
    handleOut: [v.handleOut[0], v.handleOut[1]],
    vertexType: v.vertexType,
    ...(v.handleMode ? { handleMode: v.handleMode } : {}),
  };
}

/**
 * Remove vertex `index`, healing the gap (Figma's algorithm). Fixes the endpoints A, C
 * and the outgoing/incoming TANGENT DIRECTIONS at them, then least-squares-solves the
 * two neighbour handle LENGTHS (Schneider 1990) so the single A→C cubic best fits the
 * original A→B→C curve — no kink at A/C. Corner triples just drop the point (straight
 * A→C). Open-path endpoints are trimmed. Null if the path would get too short.
 */
export function healDeleteVertex(verts: PathVertex[], index: number, closed: boolean): PathVertex[] | null {
  const n = verts.length;
  if (n <= 2 || index < 0 || index >= n) return null;
  const openEndpoint = !closed && (index === 0 || index === n - 1);
  const prevI = (index - 1 + n) % n;
  const nextI = (index + 1) % n;
  const B = verts[index], A = verts[prevI], C = verts[nextI];
  const out = verts.map(clone);

  if (!openEndpoint && (!isCorner(B) || !isCorner(A) || !isCorner(C))) {
    const P0 = A.position, P3 = C.position;
    // Sample the two original cubics A→B and B→C at t = 0,.3,.6,1.
    const abP1: Vec2 = [A.position[0] + A.handleOut[0], A.position[1] + A.handleOut[1]];
    const abP2: Vec2 = [B.position[0] + B.handleIn[0], B.position[1] + B.handleIn[1]];
    const bcP1: Vec2 = [B.position[0] + B.handleOut[0], B.position[1] + B.handleOut[1]];
    const bcP2: Vec2 = [C.position[0] + C.handleIn[0], C.position[1] + C.handleIn[1]];
    const samples: Vec2[] = [];
    for (const t of [0, 0.3, 0.6, 1]) samples.push(cubic(A.position, abP1, abP2, B.position, t));
    for (const t of [0.3, 0.6, 1]) samples.push(cubic(B.position, bcP1, bcP2, C.position, t));
    // Preserve the endpoint tangent directions (fall back to the chord if a corner).
    const t1 = norm((A.handleOut[0] || A.handleOut[1]) ? A.handleOut : [B.position[0] - A.position[0], B.position[1] - A.position[1]]);
    const t2 = norm((C.handleIn[0] || C.handleIn[1]) ? C.handleIn : [B.position[0] - C.position[0], B.position[1] - C.position[1]]);
    // Chord-length parameterize the samples.
    const us: number[] = [0];
    let total = 0;
    for (let i = 1; i < samples.length; i++) { total += Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]); us.push(total); }
    for (let i = 0; i < us.length; i++) us[i] = total > 0 ? us[i] / total : i / (us.length - 1);
    // Least-squares solve the two handle lengths α1, α2 (Schneider generateBezier).
    let m00 = 0, m01 = 0, m11 = 0, x0 = 0, x1 = 0;
    for (let i = 0; i < samples.length; i++) {
      const u = us[i], uu = 1 - u;
      const b1 = 3 * u * uu * uu, b2 = 3 * u * u * uu, b03 = uu * uu * uu + b1, b23 = b2 + u * u * u;
      const a1x = t1[0] * b1, a1y = t1[1] * b1, a2x = t2[0] * b2, a2y = t2[1] * b2;
      const rx = samples[i][0] - (P0[0] * b03 + P3[0] * b23);
      const ry = samples[i][1] - (P0[1] * b03 + P3[1] * b23);
      m00 += a1x * a1x + a1y * a1y;
      m01 += a1x * a2x + a1y * a2y;
      m11 += a2x * a2x + a2y * a2y;
      x0 += rx * a1x + ry * a1y;
      x1 += rx * a2x + ry * a2y;
    }
    const det = m00 * m11 - m01 * m01;
    let a1: number, a2: number;
    if (Math.abs(det) < 1e-9) { a1 = a2 = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]) / 3; }
    else { a1 = (x0 * m11 - m01 * x1) / det; a2 = (m00 * x1 - m01 * x0) / det; }
    if (!(a1 > 0) || !(a2 > 0)) { a1 = a2 = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]) / 3; }
    out[prevI] = { ...out[prevI], handleOut: [t1[0] * a1, t1[1] * a1], vertexType: 'bezier' };
    out[nextI] = { ...out[nextI], handleIn: [t2[0] * a2, t2[1] * a2], vertexType: 'bezier' };
  }
  return out.filter((_, i) => i !== index);
}

/** Reverse a vertex list: reverse order AND swap each vertex's in/out handles. */
export function reversePath(verts: PathVertex[]): PathVertex[] {
  return [...verts].reverse().map((v) => ({
    position: [v.position[0], v.position[1]],
    handleIn: [v.handleOut[0], v.handleOut[1]],
    handleOut: [v.handleIn[0], v.handleIn[1]],
    vertexType: v.vertexType,
    ...(v.handleMode ? { handleMode: v.handleMode } : {}),
  }));
}

/** Should an open path be closed given its selected vertex indices? True when its two
 *  endpoints are selected, or the whole path (or nothing specific) is. */
export function shouldClosePath(verts: PathVertex[], closed: boolean, selected: number[]): boolean {
  if (closed || verts.length < 2) return false;
  const s = new Set(selected);
  const n = verts.length;
  return (s.has(0) && s.has(n - 1)) || selected.length === 0 || selected.length === n;
}

/**
 * Concatenate two OPEN paths (already in the same coordinate space) into one, joining
 * their NEAREST endpoints — reversing either list as needed so `a` flows into `b` — and
 * merging the junction anchors when coincident (within `mergeDist`).
 */
export function concatPaths(a: PathVertex[], b: PathVertex[], mergeDist = 0.01): PathVertex[] {
  if (a.length === 0) return b.map(clone);
  if (b.length === 0) return a.map(clone);
  const aStart = a[0].position, aEnd = a[a.length - 1].position;
  const bStart = b[0].position, bEnd = b[b.length - 1].position;
  const d = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  // Four ways to connect an end of a to an end of b; pick the closest pair.
  const opts = [
    { dist: d(aEnd, bStart), ra: false, rb: false },  // a → b
    { dist: d(aEnd, bEnd), ra: false, rb: true },      // a → reverse(b)
    { dist: d(aStart, bStart), ra: true, rb: false },  // reverse(a) → b
    { dist: d(aStart, bEnd), ra: true, rb: true },     // reverse(a) → reverse(b)
  ].sort((x, y) => x.dist - y.dist);
  const best = opts[0];
  const av = (best.ra ? reversePath(a) : a).map(clone);
  const bv = (best.rb ? reversePath(b) : b).map(clone);
  // Merge the junction if the two connecting anchors coincide: keep av's last anchor
  // but adopt bv[0].handleOut so the outgoing curve is preserved.
  if (best.dist <= mergeDist && bv.length > 0) {
    const junction = av[av.length - 1];
    junction.handleOut = [bv[0].handleOut[0], bv[0].handleOut[1]];
    if (junction.vertexType === 'corner' && bv[0].vertexType !== 'corner') junction.vertexType = bv[0].vertexType;
    return [...av, ...bv.slice(1)];
  }
  return [...av, ...bv];
}
