// B62 - parametric outlines as bezier PathVertex rings, for shape morphs authored by agents
// (`editor.setShapeMorph`). Pure leaf (types only). Every closed outline starts at its TOP point and
// runs clockwise on screen (y down), so poses of different kinds already line up before the morph's
// optional auto-alignment (core/shapeModifiers alignRing). Coordinates are layer-local, centred on 0.

import type { PathVertex, Vec2 } from './types';
import { parseSvgPath } from './svgPath';

/** Circle-to-bezier handle ratio (4/3 * tan(pi/8)). */
export const KAPPA = 0.5522847498307936;

export type OutlineSpec =
  | { type: 'rectangle'; width: number; height: number; radius?: number }
  | { type: 'ellipse'; width: number; height: number }
  | { type: 'star'; width: number; height: number; points?: number; innerRatio?: number }
  | { type: 'polygon'; width: number; height: number; sides?: number }
  | { type: 'path'; points: OutlinePointSpec[]; closed?: boolean; holes?: OutlinePointSpec[][] }
  | { type: 'svg'; d: string; width?: number; height?: number; fit?: 'contain' | 'stretch' | 'none' };

/** B83: a path point as [x, y] (corner) or { x, y, in?, out? } with bezier handles RELATIVE to the point. */
export type OutlinePointSpec = [number, number] | { x: number; y: number; in?: [number, number]; out?: [number, number] };

/**
 * An outline: the main contour plus (B83) optional extra closed contours. Extra contours are filled
 * even-odd against the main one and each other: a contour inside a filled one is a hole (a glyph
 * counter, a ring), a contour outside every other is its own filled island (the dot of an "i", the
 * second part of a logo).
 */
export interface OutlineResult { vertices: PathVertex[]; closed: boolean; holes?: PathVertex[][] }

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

function pointVertex(p: unknown, label: string): PathVertex {
  if (Array.isArray(p)) {
    if (p.length !== 2) throw new Error(`${label} must be [x, y] or { x, y, in?, out? }`);
    return v(finite(p[0], `${label}[0]`), finite(p[1], `${label}[1]`));
  }
  if (p && typeof p === 'object') {
    const o = p as { x?: unknown; y?: unknown; in?: unknown; out?: unknown };
    const hv = (h: unknown, name: string): Vec2 => {
      if (h === undefined) return [0, 0];
      if (!Array.isArray(h) || h.length !== 2) throw new Error(`${label}.${name} must be [dx, dy] relative to the point`);
      return [finite(h[0], `${label}.${name}[0]`), finite(h[1], `${label}.${name}[1]`)];
    };
    return v(finite(o.x, `${label}.x`), finite(o.y, `${label}.y`), hv(o.in, 'in'), hv(o.out, 'out'));
  }
  throw new Error(`${label} must be [x, y] or { x, y, in?, out? }`);
}

/** Signed area of a contour's anchor polygon (shoelace; sign = winding). */
export function contourArea(vs: PathVertex[]): number {
  let a = 0;
  for (let i = 0; i < vs.length; i++) {
    const p = vs[i].position, q = vs[(i + 1) % vs.length].position;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function mapVertex(vx: PathVertex, sx: number, sy: number, tx: number, ty: number): PathVertex {
  return {
    position: [vx.position[0] * sx + tx, vx.position[1] * sy + ty],
    handleIn: [vx.handleIn[0] * sx, vx.handleIn[1] * sy],
    handleOut: [vx.handleOut[0] * sx, vx.handleOut[1] * sy],
    vertexType: vx.vertexType,
  };
}

/**
 * B83: SVG path data -> outline. Subpaths become contours; the largest by area is the main contour,
 * the rest extra contours (holes / islands, even-odd). The drawing is centred on 0 (its anchor bbox)
 * and, with width / height, scaled to fit them: 'contain' (default) keeps the aspect, 'stretch' fills
 * both, 'none' keeps the path's own units.
 */
export function svgOutline(d: string, width?: number, height?: number, fit: 'contain' | 'stretch' | 'none' = 'contain'): OutlineResult {
  const contours = parseSvgPath(d);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of contours) for (const vx of c.vertices) {
    const [x, y] = vx.position;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const bw = Math.max(maxX - minX, 1e-9), bh = Math.max(maxY - minY, 1e-9);
  let sx = 1, sy = 1;
  const hasW = typeof width === 'number' && Number.isFinite(width) && width > 0;
  const hasH = typeof height === 'number' && Number.isFinite(height) && height > 0;
  if (fit !== 'none' && (hasW || hasH)) {
    const fx = hasW ? (width as number) / bw : Infinity, fy = hasH ? (height as number) / bh : Infinity;
    if (fit === 'stretch' && hasW && hasH) { sx = fx; sy = fy; }
    else { const f = Math.min(fx, fy); sx = f; sy = f; }
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const mapped = contours.map((c) => ({ closed: c.closed, vertices: c.vertices.map((vx) => mapVertex(vx, sx, sy, -cx * sx, -cy * sy)) }));
  // Main contour: the largest; among (near) equal areas the one closest to the centre, so a morph
  // into a row of equal islands lands its main contour on the middle one instead of drifting sideways.
  const areaOf = mapped.map((c) => Math.abs(contourArea(c.vertices)));
  const distOf = mapped.map((c) => {
    let x = 0, y = 0;
    for (const vx of c.vertices) { x += vx.position[0]; y += vx.position[1]; }
    return Math.hypot(x / Math.max(1, c.vertices.length), y / Math.max(1, c.vertices.length));
  });
  let main = 0;
  for (let i = 1; i < mapped.length; i++) {
    const tie = Math.abs(areaOf[i] - areaOf[main]) <= 1e-3 * Math.max(areaOf[i], areaOf[main]);
    if ((!tie && areaOf[i] > areaOf[main]) || (tie && distOf[i] < distOf[main] - 1e-9)) main = i;
  }
  const extras = mapped.filter((_, i) => i !== main && mapped[i].vertices.length >= 3).map((c) => c.vertices);
  return { vertices: mapped[main].vertices, closed: mapped[main].closed, ...(extras.length ? { holes: extras } : {}) };
}

/** Build an outline from an (untrusted) spec. Throws a readable error on bad input. */
export function outlineFromSpec(spec: OutlineSpec): OutlineResult {
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
      const vs = spec.points.map((p, i) => pointVertex(p, `points[${i}]`));
      let holes: PathVertex[][] | undefined;
      if (spec.holes !== undefined) {
        if (!Array.isArray(spec.holes)) throw new Error('"holes" must be an array of point lists (extra closed contours)');
        holes = spec.holes.map((h, hi) => {
          if (!Array.isArray(h) || h.length < 3) throw new Error(`holes[${hi}] must have at least 3 points`);
          return h.map((p, i) => pointVertex(p, `holes[${hi}][${i}]`));
        });
      }
      return { vertices: vs, closed: spec.closed !== false, ...(holes && holes.length ? { holes } : {}) };
    }
    case 'svg': {
      const fit = spec.fit ?? 'contain';
      if (fit !== 'contain' && fit !== 'stretch' && fit !== 'none') throw new Error('"fit" must be contain, stretch or none');
      if (spec.width !== undefined) finite(spec.width, 'width');
      if (spec.height !== undefined) finite(spec.height, 'height');
      return svgOutline(spec.d, spec.width, spec.height, fit);
    }
    default:
      throw new Error('shape.type must be rectangle, ellipse, star, polygon, path, svg or layer');
  }
}
