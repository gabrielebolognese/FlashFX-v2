import type { Vec2 } from './types';

// Spatial motion path for position keyframes — the SHAPE a layer travels through space, separate
// from its temporal easing. A segment between two position keyframes is a cubic bezier whose inner
// control points are the keyframes' spatial tangents (offsets from each keyframe's position). The
// path is sampled by ARC LENGTH so the temporal easing maps to constant speed along the curve
// (matching After Effects) — otherwise a curved segment would speed up and slow down on its own.
//
// Pure, leaf module (only the Vec2 type, erased at runtime) so it bundles trivially in a harness.

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function cubicBezierVec2(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const mt = 1 - u;
  const a = mt * mt * mt, b = 3 * mt * mt * u, c = 3 * mt * u * u, d = u * u * u;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

const ARC_SAMPLES = 24;

/** Reparameterize a cubic bezier by arc length: return the point at distance-fraction `s` (0..1)
 *  along the curve, so equal steps in `s` are equal distances travelled (constant speed). */
export function pointAtArcFraction(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, s: number): Vec2 {
  const us: number[] = [0];
  const lens: number[] = [0];
  let prev = p0;
  let total = 0;
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const uu = i / ARC_SAMPLES;
    const pt = cubicBezierVec2(p0, p1, p2, p3, uu);
    total += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    us.push(uu);
    lens.push(total);
    prev = pt;
  }
  if (total < 1e-6) return cubicBezierVec2(p0, p1, p2, p3, clamp01(s)); // degenerate (all points coincide)
  const target = clamp01(s) * total;
  let i = 1;
  while (i < lens.length && lens[i] < target) i++;
  const l0 = lens[i - 1], l1 = lens[i];
  const f = l1 > l0 ? (target - l0) / (l1 - l0) : 0;
  const u = us[i - 1] + (us[i] - us[i - 1]) * f;
  return cubicBezierVec2(p0, p1, p2, p3, u);
}

/**
 * Position along one segment given the two keyframe positions, their spatial tangent offsets, and
 * the already-computed TEMPORAL progress (0..1) for the segment. No tangents → a straight line
 * (the classic behaviour); tangents → an arc-length-parameterized bezier.
 */
export function positionOnSegment(
  fromPos: Vec2,
  toPos: Vec2,
  spatialOut: Vec2 | undefined,
  spatialIn: Vec2 | undefined,
  progress: number,
): Vec2 {
  if (!spatialOut && !spatialIn) {
    return [fromPos[0] + (toPos[0] - fromPos[0]) * progress, fromPos[1] + (toPos[1] - fromPos[1]) * progress];
  }
  const p1: Vec2 = spatialOut ? [fromPos[0] + spatialOut[0], fromPos[1] + spatialOut[1]] : fromPos;
  const p2: Vec2 = spatialIn ? [toPos[0] + spatialIn[0], toPos[1] + spatialIn[1]] : toPos;
  return pointAtArcFraction(fromPos, p1, p2, toPos, progress);
}

/**
 * Auto (smooth / "Auto Bezier") spatial tangents for the middle keyframe of prev→cur→next, returned
 * as offsets from `cur`. The handle direction follows (next − prev) — a Catmull-Rom-style smooth —
 * with each side's length ~1/3 of the distance to that neighbour. A missing neighbour (an endpoint)
 * yields a zero tangent on that side, so the path eases straight out of the ends.
 */
export function autoSpatialTangents(prev: Vec2 | null, cur: Vec2, next: Vec2 | null): { in: Vec2; out: Vec2 } {
  const a = prev ?? cur;
  const b = next ?? cur;
  const dir: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  const nrm: Vec2 = [dir[0] / dl, dir[1] / dl];
  const outLen = next ? dist(cur, next) / 3 : 0;
  const inLen = prev ? dist(prev, cur) / 3 : 0;
  return {
    out: [nrm[0] * outLen, nrm[1] * outLen],
    in: [-nrm[0] * inLen, -nrm[1] * inLen],
  };
}
