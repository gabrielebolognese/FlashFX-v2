// B62 - parametric outlines as bezier PathVertex rings, for shape morphs authored by agents
// (`editor.setShapeMorph`). Pure leaf (types only). Every closed outline starts at its TOP point and
// runs clockwise on screen (y down), so poses of different kinds already line up before the morph's
// optional auto-alignment (core/shapeModifiers alignRing). Coordinates are layer-local, centred on 0.

import type { PathVertex, Vec2 } from './types';

/** Circle-to-bezier handle ratio (4/3 * tan(pi/8)). */
export const KAPPA = 0.5522847498307936;

export type OutlineSpec =
  | { type: 'rectangle'; width: number; height: number; radius?: number }
  | { type: 'ellipse'; width: number; height: number }
  | { type: 'star'; width: number; height: number; points?: number; innerRatio?: number }
  | { type: 'polygon'; width: number; height: number; sides?: number }
  | { type: 'path'; points: Array<[number, number]>; closed?: boolean };

const v = (x: number, y: number, hin: Vec2 = [0, 0], hout: Vec2 = [0, 0]): PathVertex => ({
  position: [x, y],
  handleIn: [hin[0], hin[1]],
  handleOut: [hout[0], hout[1]],
  vertexType: hin[0] === 0 && hin[1] === 0 && hout[0] === 0 && hout[1] === 0 ? 'corner' : 'smooth',
});

function finite(n: unknown, name: string): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`"${name}" must be a number`);
  return n;
}

/** Rounded rectangle: top-middle start, clockwise; radius clamped to half the short side. */
export function rectangleOutline(width: number, height: number, radius = 0): PathVertex[] {
  const w = Math.abs(width) / 2, h = Math.abs(height) / 2;
  const r = Math.max(0, Math.min(radius, w, h));
  if (r <= 0) return [v(0, -h), v(w, -h), v(w, h), v(-w, h), v(-w, -h)];
  const k = KAPPA * r;
  return [
    v(0, -h),
    v(w - r, -h, [0, 0], [k, 0]), v(w, -h + r, [0, -k], [0, 0]),
    v(w, h - r, [0, 0], [0, k]), v(w - r, h, [k, 0], [0, 0]),
    v(-w + r, h, [0, 0], [-k, 0]), v(-w, h - r, [0, k], [0, 0]),
    v(-w, -h + r, [0, 0], [0, -k]), v(-w + r, -h, [-k, 0], [0, 0]),
  ];
}

/** Ellipse as four cubic arcs: top, right, bottom, left. */
export function ellipseOutline(width: number, height: number): PathVertex[] {
  const rx = Math.abs(width) / 2, ry = Math.abs(height) / 2;
  const kx = KAPPA * rx, ky = KAPPA * ry;
  return [
    v(0, -ry, [-kx, 0], [kx, 0]),
    v(rx, 0, [0, -ky], [0, ky]),
    v(0, ry, [kx, 0], [-kx, 0]),
    v(-rx, 0, [0, ky], [0, -ky]),
  ];
}

/** Star with `points` tips inside a width x height box (tips on the box ellipse), top tip first. */
export function starOutline(width: number, height: number, points = 5, innerRatio = 0.45): PathVertex[] {
  const n = Math.max(3, Math.round(points));
  const rx = Math.abs(width) / 2, ry = Math.abs(height) / 2;
  const ir = Math.min(1, Math.max(0.01, innerRatio));
  const out: PathVertex[] = [];
  for (let i = 0; i < 2 * n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    const f = i % 2 === 0 ? 1 : ir;
    out.push(v(rx * f * Math.cos(a), ry * f * Math.sin(a)));
  }
  return out;
}

/** Regular polygon inscribed in the width x height ellipse, top vertex first. */
export function polygonOutline(width: number, height: number, sides = 6): PathVertex[] {
  const n = Math.max(3, Math.round(sides));
  const rx = Math.abs(width) / 2, ry = Math.abs(height) / 2;
  const out: PathVertex[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    out.push(v(rx * Math.cos(a), ry * Math.sin(a)));
  }
  return out;
}

/** Build an outline from an (untrusted) spec. Throws a readable error on bad input. */
export function outlineFromSpec(spec: OutlineSpec): { vertices: PathVertex[]; closed: boolean } {
  if (!spec || typeof spec !== 'object') throw new Error('shape must be an object { type, width, height, ... }');
  switch (spec.type) {
    case 'rectangle':
      return { vertices: rectangleOutline(finite(spec.width, 'width'), finite(spec.height, 'height'), spec.radius === undefined ? 0 : finite(spec.radius, 'radius')), closed: true };
    case 'ellipse':
      return { vertices: ellipseOutline(finite(spec.width, 'width'), finite(spec.height, 'height')), closed: true };
    case 'star':
      return { vertices: starOutline(finite(spec.width, 'width'), finite(spec.height, 'height'), spec.points ?? 5, spec.innerRatio ?? 0.45), closed: true };
    case 'polygon':
      return { vertices: polygonOutline(finite(spec.width, 'width'), finite(spec.height, 'height'), spec.sides ?? 6), closed: true };
    case 'path': {
      if (!Array.isArray(spec.points) || spec.points.length < 2) throw new Error('"points" must be at least 2 [x, y] pairs');
      const vs = spec.points.map((p, i) => {
        if (!Array.isArray(p) || p.length !== 2) throw new Error(`points[${i}] must be [x, y]`);
        return v(finite(p[0], `points[${i}][0]`), finite(p[1], `points[${i}][1]`));
      });
      return { vertices: vs, closed: spec.closed !== false };
    }
    default:
      throw new Error('shape.type must be rectangle, ellipse, star, polygon or path');
  }
}
