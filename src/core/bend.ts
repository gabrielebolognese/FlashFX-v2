import type { Vec2, PathVertex } from './types';

// Pure math for the Bend tool: hit-testing a point against a path segment, and the
// handle delta that curves a segment so it passes through a dragged point. The bend
// grows BOTH endpoint handles by the same vector h; since B(t) shifts by 3(1-t)t·h
// when both control points move by h, the curve passes exactly through the target at
// t. Dependency-free + deterministic (scripts/verify-bend.mjs).

/** Cubic Bézier point at t (handles are relative to their anchors). */
export function evalCubic(a: PathVertex, b: PathVertex, t: number): Vec2 {
  const p0 = a.position, p3 = b.position;
  const p1x = a.position[0] + a.handleOut[0], p1y = a.position[1] + a.handleOut[1];
  const p2x = b.position[0] + b.handleIn[0], p2y = b.position[1] + b.handleIn[1];
  const u = 1 - t;
  const uu = u * u, tt = t * t;
  const a0 = uu * u, a1 = 3 * uu * t, a2 = 3 * u * tt, a3 = tt * t;
  return [
    a0 * p0[0] + a1 * p1x + a2 * p2x + a3 * p3[0],
    a0 * p0[1] + a1 * p1y + a2 * p2y + a3 * p3[1],
  ];
}

/** Closest parameter t on the A→B segment to point p (by sampling), + its distance. */
export function closestOnSegment(p: Vec2, a: PathVertex, b: PathVertex, samples = 24): { t: number; dist: number } {
  let bestT = 0, bestD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const q = evalCubic(a, b, t);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < bestD) { bestD = d; bestT = t; }
  }
  return { t: bestT, dist: bestD };
}

/**
 * The handle vector to ADD to both a.handleOut and b.handleIn so the A→B cubic passes
 * through `target` at parameter t. `t` is clamped away from the endpoints.
 */
export function bendHandleDelta(a: PathVertex, b: PathVertex, t: number, target: Vec2): Vec2 {
  const tt = Math.min(0.999, Math.max(0.001, t));
  const cur = evalCubic(a, b, tt);
  const coef = 3 * (1 - tt) * tt; // ∂B(t)/∂h when both control points move by h
  return [(target[0] - cur[0]) / coef, (target[1] - cur[1]) / coef];
}
