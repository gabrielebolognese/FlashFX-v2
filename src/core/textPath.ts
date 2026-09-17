// Text-on-a-path placement (B9b). Pure, self-contained cubic-bezier sampler with TRUE arc-length
// reparameterization — so glyphs are evenly spaced along the path (a straight 2-node path does not
// bunch them, unlike the parameter-space sampler in motionPath.ts). No import of the interpolation
// engine (motionPath.ts pulls in the worker-spawning expression manager via evaluateNumber), so this
// bundles in a node harness (`verify:text-kinetic`). Nodes are in the text layer's LOCAL space; the
// glyph stamps compose with the layer world transform exactly like the linear-placement path. The
// maths is unit-tested; the on-canvas look is browser-eyeballed like every text stamp.

import type { Vec2 } from './types';

export interface TextPathNode {
  position: Vec2;
  handleIn: Vec2;
  handleOut: Vec2;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t, uu = u * u, uuu = uu * u, tt = t * t, ttt = tt * t;
  return [
    uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0],
    uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1],
  ];
}

interface SegCtl { p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2; }

function segControls(nodes: TextPathNode[], closed: boolean): SegCtl[] {
  const out: SegCtl[] = [];
  const n = nodes.length;
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % n];
    out.push({
      p0: a.position,
      p1: [a.position[0] + a.handleOut[0], a.position[1] + a.handleOut[1]],
      p2: [b.position[0] + b.handleIn[0], b.position[1] + b.handleIn[1]],
      p3: b.position,
    });
  }
  return out;
}

interface LUT { pts: Vec2[]; cum: number[]; total: number }

// Dense arc-length lookup: sample every segment `perSeg` times and accumulate chord lengths.
function buildLUT(nodes: TextPathNode[], closed: boolean, perSeg = 24): LUT {
  const segs = segControls(nodes, closed);
  if (segs.length === 0) {
    const p = nodes[0]?.position ?? [0, 0];
    return { pts: [[p[0], p[1]]], cum: [0], total: 0 };
  }
  const pts: Vec2[] = [cubicPoint(segs[0].p0, segs[0].p1, segs[0].p2, segs[0].p3, 0)];
  const cum: number[] = [0];
  let total = 0;
  for (const s of segs) {
    for (let k = 1; k <= perSeg; k++) {
      const pt = cubicPoint(s.p0, s.p1, s.p2, s.p3, k / perSeg);
      const prev = pts[pts.length - 1];
      total += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
      pts.push(pt);
      cum.push(total);
    }
  }
  return { pts, cum, total };
}

export function totalPathLength(nodes: TextPathNode[], closed: boolean): number {
  if (nodes.length < 2) return 0;
  return buildLUT(nodes, closed).total;
}

/** Position + tangent angle (degrees) at an arc-length fraction (0..1). Evenly spaced by arc length. */
export function pointAndAngleAt(nodes: TextPathNode[], closed: boolean, fraction: number): { position: Vec2; angle: number } {
  if (nodes.length === 0) return { position: [0, 0], angle: 0 };
  if (nodes.length === 1) return { position: [nodes[0].position[0], nodes[0].position[1]], angle: 0 };
  const lut = buildLUT(nodes, closed);
  if (lut.total === 0) return { position: [lut.pts[0][0], lut.pts[0][1]], angle: 0 };

  const target = clamp01(fraction) * lut.total;
  let i = 0;
  while (i < lut.cum.length - 2 && lut.cum[i + 1] < target) i++;
  const span = lut.cum[i + 1] - lut.cum[i];
  const t = span < 1e-9 ? 0 : (target - lut.cum[i]) / span;
  const a = lut.pts[i];
  const b = lut.pts[i + 1];
  const position: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // Tangent = the local chord direction (stable, matches the even-spacing walk).
  const angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return { position, angle };
}

/** Arc-length fraction for a glyph whose baseline center is `centerDist` px from the text start. */
export function glyphPathFraction(centerDist: number, pathLength: number, margin: number): number {
  if (pathLength <= 0) return 0;
  return clamp01((centerDist + margin) / pathLength);
}
