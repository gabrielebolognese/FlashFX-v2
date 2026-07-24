// polygon-clipping's ESM build exposes ONLY a default export (an object with the
// ops); its .d.ts mis-declares named exports, so import the default and read the
// ops off it. Types come from the named type exports (which do resolve).
import pc from 'polygon-clipping';
import type { Ring, Polygon, MultiPolygon } from 'polygon-clipping';
import type { Layer, ShapeGeometry, PathVertex, Vec2, VertexType } from './types';
import { evaluateNumber } from './interpolation';
import { getWorldPosition, getWorldScale, getWorldRotation } from './snap/bbox';

export type BooleanOp = 'union' | 'intersection' | 'difference' | 'xor';

const CIRCLE_SEGMENTS = 48;

/** Sample a shape into a flat ring of local points (centered at the layer origin,
 *  matching how getLayerRect treats shapes). Beziers on polygons are flattened to
 *  their anchor points (adequate for clipping / conversion). */
function sampleShapeLocalRing(shape: ShapeGeometry, frame: number): Vec2[] {
  switch (shape.type) {
    case 'rectangle': {
      const w = evaluateNumber(shape.width, frame) / 2;
      const h = evaluateNumber(shape.height, frame) / 2;
      return [[-w, -h], [w, -h], [w, h], [-w, h]];
    }
    case 'circle': {
      const r = evaluateNumber(shape.radius, frame);
      const pts: Vec2[] = [];
      for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
        const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
        pts.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      return pts;
    }
    case 'star': {
      const p = Math.max(2, Math.round(evaluateNumber(shape.points, frame)));
      const outer = evaluateNumber(shape.outerRadius, frame);
      const inner = evaluateNumber(shape.innerRadius, frame);
      const pts: Vec2[] = [];
      for (let i = 0; i < 2 * p; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / p;
        const rad = i % 2 === 0 ? outer : inner;
        pts.push([rad * Math.cos(a), rad * Math.sin(a)]);
      }
      return pts;
    }
    case 'polygon':
      return shape.vertices.map((v) => [v.position[0], v.position[1]] as Vec2);
  }
}

function cornerVertex(pos: Vec2): PathVertex {
  return { position: [pos[0], pos[1]], handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' as VertexType };
}

/** Object → Path: sample any shape into corner vertices in the SAME local space,
 *  so the layer keeps its transform and on-screen appearance is preserved. */
export function shapeToPathVertices(shape: ShapeGeometry, frame: number): PathVertex[] {
  return sampleShapeLocalRing(shape, frame).map(cornerVertex);
}

/** Reverse a path's winding: reverse vertex order and swap each vertex's handles. */
export function reversePathVertices(vertices: PathVertex[]): PathVertex[] {
  return [...vertices].reverse().map((v) => ({
    position: [v.position[0], v.position[1]],
    handleIn: [v.handleOut[0], v.handleOut[1]],
    handleOut: [v.handleIn[0], v.handleIn[1]],
    vertexType: v.vertexType,
  }));
}

function perpDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

/** Ramer–Douglas–Peucker simplification on vertex positions (endpoints kept). */
export function simplifyPathVertices(vertices: PathVertex[], tolerance: number): PathVertex[] {
  if (vertices.length <= 2 || tolerance <= 0) return vertices;
  const pts = vertices.map((v) => v.position);
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDistance(pts[i], pts[s], pts[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolerance && idx !== -1) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return vertices.filter((_, i) => keep[i]);
}

function localToWorld(local: Vec2, wp: Vec2, ws: Vec2, rot: number): Vec2 {
  const sx = local[0] * ws[0];
  const sy = local[1] * ws[1];
  return [wp[0] + sx * Math.cos(rot) - sy * Math.sin(rot), wp[1] + sx * Math.sin(rot) + sy * Math.cos(rot)];
}

/** A shape layer's outline transformed into composition (world) space. */
function layerToWorldRing(layer: Layer, layers: Layer[], frame: number): Vec2[] | null {
  if (layer.type !== 'shape') return null;
  const local = sampleShapeLocalRing(layer.shape, frame);
  if (local.length < 3) return null;
  const wp = getWorldPosition(layer, layers, frame);
  const ws = getWorldScale(layer, layers, frame);
  const rot = (getWorldRotation(layer, layers, frame) * Math.PI) / 180;
  return local.map((p) => localToWorld(p, wp, ws, rot));
}

export interface BooleanResultLayer {
  position: Vec2;
  vertices: PathVertex[];
}

/**
 * Run a boolean op over the given shape layers (world space) and return one
 * result-layer spec per output polygon — each recentered around its centroid
 * (matching createPenPath) so the new layer's transform anchors sensibly. Holes
 * aren't representable as a single PolygonShape and are dropped (outer ring only).
 */
export function booleanLayers(op: BooleanOp, layers: Layer[], ids: string[], frame: number): BooleanResultLayer[] {
  const polys: Polygon[] = [];
  for (const id of ids) {
    const layer = layers.find((l) => l.id === id);
    if (!layer) continue;
    const ring = layerToWorldRing(layer, layers, frame);
    if (!ring || ring.length < 3) continue;
    polys.push([ring.map((p) => [p[0], p[1]]) as Ring]);
  }
  if (polys.length < 2) return [];

  const [first, ...rest] = polys;
  const result: MultiPolygon =
    op === 'union' ? pc.union(first, ...rest)
    : op === 'intersection' ? pc.intersection(first, ...rest)
    : op === 'difference' ? pc.difference(first, ...rest)
    : pc.xor(first, ...rest);

  const out: BooleanResultLayer[] = [];
  for (const polygon of result) {
    const outer = polygon[0];
    if (!outer || outer.length < 3) continue;
    // polygon-clipping returns closed rings (last point duplicates the first).
    const last = outer[outer.length - 1];
    const ringPts = last[0] === outer[0][0] && last[1] === outer[0][1] ? outer.slice(0, -1) : outer;
    let cx = 0;
    let cy = 0;
    for (const pt of ringPts) { cx += pt[0]; cy += pt[1]; }
    cx /= ringPts.length;
    cy /= ringPts.length;
    out.push({
      position: [cx, cy],
      vertices: ringPts.map((pt) => cornerVertex([pt[0] - cx, pt[1] - cy])),
    });
  }
  return out;
}
