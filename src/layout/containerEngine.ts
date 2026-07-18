import type {
  ContainerShapeConfig,
  ContainerDistributionMode,
  ContainerChildEntry,
  ContainerComputedData,
  PathVertex,
  Vec2,
} from '../core/types';

// ─── Path Sampling ───

interface PathPoint {
  x: number;
  y: number;
  angle: number;
}

function cubicBezierPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    mt3 * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t3 * p3[0],
    mt3 * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t3 * p3[1],
  ];
}

function cubicBezierTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return [
    3 * mt2 * (p1[0] - p0[0]) + 6 * mt * t * (p2[0] - p1[0]) + 3 * t2 * (p3[0] - p2[0]),
    3 * mt2 * (p1[1] - p0[1]) + 6 * mt * t * (p2[1] - p1[1]) + 3 * t2 * (p3[1] - p2[1]),
  ];
}

function segmentLength(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, steps = 16): number {
  let length = 0;
  let prev = p0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const pt = cubicBezierPoint(p0, p1, p2, p3, t);
    const dx = pt[0] - prev[0];
    const dy = pt[1] - prev[1];
    length += Math.sqrt(dx * dx + dy * dy);
    prev = pt;
  }
  return length;
}

interface PathSegment {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
  length: number;
  startT: number;
}

function buildPathSegments(vertices: PathVertex[], closed: boolean): PathSegment[] {
  const segments: PathSegment[] = [];
  const count = vertices.length;
  if (count < 2) return segments;

  const segCount = closed ? count : count - 1;
  for (let i = 0; i < segCount; i++) {
    const v0 = vertices[i];
    const v1 = vertices[(i + 1) % count];
    const p0: Vec2 = v0.position;
    const p1: Vec2 = [v0.position[0] + v0.handleOut[0], v0.position[1] + v0.handleOut[1]];
    const p2: Vec2 = [v1.position[0] + v1.handleIn[0], v1.position[1] + v1.handleIn[1]];
    const p3: Vec2 = v1.position;
    segments.push({ p0, p1, p2, p3, length: segmentLength(p0, p1, p2, p3), startT: 0 });
  }

  let accumulated = 0;
  const totalLength = segments.reduce((s, seg) => s + seg.length, 0);
  for (const seg of segments) {
    seg.startT = totalLength > 0 ? accumulated / totalLength : 0;
    accumulated += seg.length;
  }

  return segments;
}

function samplePathAtT(segments: PathSegment[], totalLength: number, t: number): PathPoint {
  if (segments.length === 0) return { x: 0, y: 0, angle: 0 };

  const clampedT = Math.max(0, Math.min(1, t));
  const targetDist = clampedT * totalLength;

  let accumulated = 0;
  for (const seg of segments) {
    if (accumulated + seg.length >= targetDist || seg === segments[segments.length - 1]) {
      const localT = seg.length > 0 ? (targetDist - accumulated) / seg.length : 0;
      const pt = cubicBezierPoint(seg.p0, seg.p1, seg.p2, seg.p3, Math.max(0, Math.min(1, localT)));
      const tangent = cubicBezierTangent(seg.p0, seg.p1, seg.p2, seg.p3, Math.max(0, Math.min(1, localT)));
      const angle = Math.atan2(tangent[1], tangent[0]) * (180 / Math.PI);
      return { x: pt[0], y: pt[1], angle };
    }
    accumulated += seg.length;
  }

  const last = segments[segments.length - 1];
  return { x: last.p3[0], y: last.p3[1], angle: 0 };
}

// ─── Shape to Path Conversion ───

function rectangleToVertices(width: number, height: number): PathVertex[] {
  const hw = width / 2;
  const hh = height / 2;
  const corners: Vec2[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  return corners.map((pos) => ({
    position: pos,
    handleIn: [0, 0] as Vec2,
    handleOut: [0, 0] as Vec2,
    vertexType: 'corner' as const,
  }));
}

function circleToVertices(radius: number, segments = 32): PathVertex[] {
  const verts: PathVertex[] = [];
  const k = (4 / 3) * Math.tan(Math.PI / (2 * segments));
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    const dx = -Math.sin(a) * radius * k;
    const dy = Math.cos(a) * radius * k;
    verts.push({
      position: [x, y],
      handleIn: [-dx, -dy],
      handleOut: [dx, dy],
      vertexType: 'smooth',
    });
  }
  return verts;
}

function getShapeVertices(shape: ContainerShapeConfig): { vertices: PathVertex[]; closed: boolean } {
  switch (shape.type) {
    case 'rectangle':
      return { vertices: rectangleToVertices(shape.width, shape.height), closed: true };
    case 'circle':
      return { vertices: circleToVertices(shape.radius), closed: true };
    case 'customVector':
      return { vertices: shape.vertices, closed: shape.closed };
  }
}

// ─── Distribution Algorithms ───

function distributeBorder(
  childCount: number,
  // Border distribution spreads children evenly around the perimeter, so the gap
  // is derived from the available length rather than set by the caller. Kept for
  // signature parity with the other distribute* modes.
  _spacing: number,
  padding: number,
  totalLength: number,
): number[] {
  if (childCount === 0) return [];
  if (childCount === 1) return [0];

  const usableLength = totalLength - padding * 2;
  const positions: number[] = [];
  for (let i = 0; i < childCount; i++) {
    const t = (padding + (usableLength * i) / (childCount)) / totalLength;
    positions.push(Math.max(0, Math.min(1, t)));
  }
  return positions;
}

function distributeEven(childCount: number, padding: number, totalLength: number): number[] {
  if (childCount === 0) return [];
  if (childCount === 1) return [0.5];

  const positions: number[] = [];
  const usable = totalLength - padding * 2;
  for (let i = 0; i < childCount; i++) {
    const t = (padding + (usable * i) / (childCount - 1)) / totalLength;
    positions.push(Math.max(0, Math.min(1, t)));
  }
  return positions;
}

function distributeVertices(
  childCount: number,
  vertices: PathVertex[],
  segments: PathSegment[],
  totalLength: number,
): number[] {
  if (childCount === 0) return [];
  const vertexTs: number[] = [0];
  let accumulated = 0;
  for (let i = 0; i < segments.length && vertexTs.length < vertices.length; i++) {
    accumulated += segments[i].length;
    vertexTs.push(totalLength > 0 ? accumulated / totalLength : 0);
  }
  const positions: number[] = [];
  for (let i = 0; i < childCount; i++) {
    positions.push(vertexTs[i % vertexTs.length]);
  }
  return positions;
}

function distributeInterior(
  childCount: number,
  shape: ContainerShapeConfig,
  padding: number,
): { x: number; y: number; angle: number }[] {
  if (childCount === 0) return [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(childCount)));
  const rows = Math.ceil(childCount / cols);

  let w: number, h: number;
  if (shape.type === 'circle') {
    w = shape.radius * 2 - padding * 2;
    h = shape.radius * 2 - padding * 2;
  } else {
    w = shape.width - padding * 2;
    h = shape.height - padding * 2;
  }

  const results: { x: number; y: number; angle: number }[] = [];
  for (let i = 0; i < childCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = -w / 2 + (w * (col + 0.5)) / cols;
    const y = -h / 2 + (h * (row + 0.5)) / rows;
    results.push({ x, y, angle: 0 });
  }
  return results;
}

function distributeCenter(childCount: number): { x: number; y: number; angle: number }[] {
  return Array.from({ length: childCount }, () => ({ x: 0, y: 0, angle: 0 }));
}

// ─── Main Computation ───

export function computeContainerLayout(
  shape: ContainerShapeConfig,
  distributionMode: ContainerDistributionMode,
  children: ContainerChildEntry[],
  spacing: number,
  padding: number,
  rotationOffset: number,
): ContainerComputedData {
  const { vertices, closed } = getShapeVertices(shape);
  const segments = buildPathSegments(vertices, closed);
  const totalLength = segments.reduce((s, seg) => s + seg.length, 0);

  let cx = 0, cy = 0;
  if (vertices.length > 0) {
    for (const v of vertices) {
      cx += v.position[0];
      cy += v.position[1];
    }
    cx /= vertices.length;
    cy /= vertices.length;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vertices) {
    minX = Math.min(minX, v.position[0]);
    minY = Math.min(minY, v.position[1]);
    maxX = Math.max(maxX, v.position[0]);
    maxY = Math.max(maxY, v.position[1]);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

  const childPositions: Record<string, { x: number; y: number; angle: number }> = {};
  const childCount = children.length;

  if (distributionMode === 'interior') {
    const positions = distributeInterior(childCount, shape, padding);
    for (let i = 0; i < childCount; i++) {
      childPositions[children[i].id] = positions[i];
    }
  } else if (distributionMode === 'center') {
    const positions = distributeCenter(childCount);
    for (let i = 0; i < childCount; i++) {
      childPositions[children[i].id] = positions[i];
    }
  } else {
    let normalizedPositions: number[];

    if (distributionMode === 'vertices') {
      normalizedPositions = distributeVertices(childCount, vertices, segments, totalLength);
    } else if (distributionMode === 'evenDistribution') {
      normalizedPositions = distributeEven(childCount, padding, totalLength);
    } else {
      normalizedPositions = distributeBorder(childCount, spacing, padding, totalLength);
    }

    const offsetT = rotationOffset / 360;

    for (let i = 0; i < childCount; i++) {
      let t = (children[i].normalizedPosition >= 0 ? children[i].normalizedPosition : normalizedPositions[i]) + offsetT;
      if (closed) {
        t = ((t % 1) + 1) % 1;
      } else {
        t = Math.max(0, Math.min(1, t));
      }
      const pt = samplePathAtT(segments, totalLength, t);
      childPositions[children[i].id] = pt;
    }
  }

  return {
    pathLength: totalLength,
    center: [cx, cy],
    bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    childPositions,
  };
}
