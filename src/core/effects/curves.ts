// Color grading (B15) - tone curves (pure leaf, no imports). Evaluates a control-point curve and
// bakes it to a 1D LUT for fast per-pixel application (master + per-channel R/G/B). Linear
// interpolation between sorted points keeps it predictable + exactly testable (verify:curves). Used by
// the Color Grade image-tool bake now; the GPU 1D-LUT path is B15-gpu.

export interface CurvePoint { x: number; y: number }

export const IDENTITY_CURVE: CurvePoint[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Sorted, clamped, de-duplicated (by x) control points with endpoints implied. */
function normalize(points: CurvePoint[]): CurvePoint[] {
  const pts = (points && points.length >= 1 ? points : IDENTITY_CURVE)
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);
  // collapse duplicate x (keep last)
  const out: CurvePoint[] = [];
  for (const p of pts) {
    if (out.length && Math.abs(out[out.length - 1].x - p.x) < 1e-9) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

/** Evaluate the curve at x in [0,1] via linear interpolation between control points (clamped ends). */
export function evalCurve(points: CurvePoint[], x: number): number {
  const pts = normalize(points);
  const xc = clamp01(x);
  if (xc <= pts[0].x) return pts[0].y;
  if (xc >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (xc >= a.x && xc <= b.x) {
      const t = b.x - a.x < 1e-9 ? 0 : (xc - a.x) / (b.x - a.x);
      return clamp01(a.y + (b.y - a.y) * t);
    }
  }
  return pts[pts.length - 1].y;
}

/** Bake a curve to a 1D LUT of `size` samples in [0,1]. */
export function bakeCurve1D(points: CurvePoint[], size = 256): Float32Array {
  const n = Math.max(2, Math.floor(size));
  const out = new Float32Array(n);
  const pts = normalize(points);
  for (let i = 0; i < n; i++) out[i] = evalCurve(pts, i / (n - 1));
  return out;
}

/** Sample a baked 1D LUT (linear interpolation) at x in [0,1]. */
export function sampleCurve1D(lut: Float32Array, x: number): number {
  const d = lut.length - 1;
  const f = clamp01(x) * d;
  const i0 = Math.floor(f), i1 = Math.min(i0 + 1, d);
  return lut[i0] + (lut[i1] - lut[i0]) * (f - i0);
}

/** Is a curve the identity (passes every input straight through)? */
export function isIdentityCurve(points: CurvePoint[]): boolean {
  const pts = normalize(points);
  return pts.every((p) => Math.abs(p.x - p.y) < 1e-6) && Math.abs(pts[0].x - 0) < 1e-6 && Math.abs(pts[pts.length - 1].x - 1) < 1e-6;
}
