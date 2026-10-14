// Vector path vertex edits shared by the shape pen tools (store/editor.ts) and freeform path masks
// (B10d-mask). Moved verbatim out of editor.ts so both callers share ONE implementation. Pure: only
// types, no React/DOM/store imports.

import type { PathVertex, Vec2, VertexType } from './types';

function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Insert a point on the cubic segment between vertices a and b at parameter t,
// updating only the local segment (a.handleOut, b.handleIn) via De Casteljau.
// Straight segments (no handles) stay straight - a plain corner is inserted.
export function insertPointOnSegment(
  verts: PathVertex[],
  segIndex: number,
  a: PathVertex,
  b: PathVertex,
  t: number,
  _closed: boolean,
): PathVertex[] | null {
  void _closed;
  const tt = Math.min(0.999, Math.max(0.001, t));

  const straight =
    a.handleOut[0] === 0 && a.handleOut[1] === 0 &&
    b.handleIn[0] === 0 && b.handleIn[1] === 0;

  const out = verts.map((v) => ({
    position: [v.position[0], v.position[1]] as Vec2,
    handleIn: [v.handleIn[0], v.handleIn[1]] as Vec2,
    handleOut: [v.handleOut[0], v.handleOut[1]] as Vec2,
    vertexType: v.vertexType,
  }));

  if (straight) {
    const pos = lerp2(a.position, b.position, tt);
    const newVertex: PathVertex = {
      position: pos,
      handleIn: [0, 0],
      handleOut: [0, 0],
      vertexType: 'corner',
    };
    out.splice(segIndex + 1, 0, newVertex);
    return out;
  }

  const p0 = a.position;
  const p1: Vec2 = [a.position[0] + a.handleOut[0], a.position[1] + a.handleOut[1]];
  const p2: Vec2 = [b.position[0] + b.handleIn[0], b.position[1] + b.handleIn[1]];
  const p3 = b.position;

  const p01 = lerp2(p0, p1, tt);
  const p12 = lerp2(p1, p2, tt);
  const p23 = lerp2(p2, p3, tt);
  const p012 = lerp2(p01, p12, tt);
  const p123 = lerp2(p12, p23, tt);
  const mid = lerp2(p012, p123, tt);

  const ai = segIndex;
  const bi = (segIndex + 1) % out.length;

  out[ai].handleOut = [p01[0] - p0[0], p01[1] - p0[1]];
  out[bi].handleIn = [p23[0] - p3[0], p23[1] - p3[1]];

  const newVertex: PathVertex = {
    position: mid,
    handleIn: [p012[0] - mid[0], p012[1] - mid[1]],
    handleOut: [p123[0] - mid[0], p123[1] - mid[1]],
    vertexType: 'bezier',
  };
  out.splice(segIndex + 1, 0, newVertex);
  return out;
}

// Convert a vertex between corner (no handles) and bezier (auto-tangent handles).
export function applyVertexType(
  verts: PathVertex[],
  index: number,
  type: VertexType,
  closed: boolean,
): PathVertex[] {
  const out = verts.map((v) => ({
    position: [v.position[0], v.position[1]] as Vec2,
    handleIn: [v.handleIn[0], v.handleIn[1]] as Vec2,
    handleOut: [v.handleOut[0], v.handleOut[1]] as Vec2,
    vertexType: v.vertexType,
  }));
  const n = out.length;
  const v = out[index];

  if (type === 'corner') {
    v.handleIn = [0, 0];
    v.handleOut = [0, 0];
    v.vertexType = 'corner';
    return out;
  }

  // bezier / smooth: synthesize handles from the neighbour tangent.
  const hasPrev = closed || index > 0;
  const hasNext = closed || index < n - 1;
  const prev = hasPrev ? out[(index - 1 + n) % n].position : v.position;
  const next = hasNext ? out[(index + 1) % n].position : v.position;

  const tx = next[0] - prev[0];
  const ty = next[1] - prev[1];
  const len = Math.hypot(tx, ty) || 1;
  const dirX = tx / len;
  const dirY = ty / len;

  const inLen = hasPrev ? Math.hypot(v.position[0] - prev[0], v.position[1] - prev[1]) / 3 : len / 3;
  const outLen = hasNext ? Math.hypot(next[0] - v.position[0], next[1] - v.position[1]) / 3 : len / 3;

  v.handleIn = [-dirX * inLen, -dirY * inLen];
  v.handleOut = [dirX * outLen, dirY * outLen];
  v.vertexType = type;
  return out;
}
