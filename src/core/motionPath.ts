import type { MotionPath, MotionPathNode, Vec2 } from './types';
import { evaluateNumber } from './interpolation';

function cubicBezierPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return [
    uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0],
    uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1],
  ];
}

function cubicBezierTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return [
    3 * uu * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * tt * (p3[0] - p2[0]),
    3 * uu * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * tt * (p3[1] - p2[1]),
  ];
}

function segmentLength(p0: Vec2, cp1: Vec2, cp2: Vec2, p3: Vec2, samples: number = 16): number {
  let length = 0;
  let prevPoint = p0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const pt = cubicBezierPoint(p0, cp1, cp2, p3, t);
    const dx = pt[0] - prevPoint[0];
    const dy = pt[1] - prevPoint[1];
    length += Math.sqrt(dx * dx + dy * dy);
    prevPoint = pt;
  }
  return length;
}

interface SegmentInfo {
  startNode: MotionPathNode;
  endNode: MotionPathNode;
  length: number;
  cp1: Vec2;
  cp2: Vec2;
}

function getSegments(path: MotionPath): SegmentInfo[] {
  const segments: SegmentInfo[] = [];
  const nodes = path.nodes;
  const count = path.closed ? nodes.length : nodes.length - 1;

  for (let i = 0; i < count; i++) {
    const startNode = nodes[i];
    const endNode = nodes[(i + 1) % nodes.length];
    const cp1: Vec2 = [
      startNode.position[0] + startNode.handleOut[0],
      startNode.position[1] + startNode.handleOut[1],
    ];
    const cp2: Vec2 = [
      endNode.position[0] + endNode.handleIn[0],
      endNode.position[1] + endNode.handleIn[1],
    ];
    const len = segmentLength(startNode.position, cp1, cp2, endNode.position);
    segments.push({ startNode, endNode, length: len, cp1, cp2 });
  }
  return segments;
}

export function getTotalPathLength(path: MotionPath): number {
  const segments = getSegments(path);
  return segments.reduce((sum, s) => sum + s.length, 0);
}

export function evaluatePathAtProgress(path: MotionPath, progress: number): { position: Vec2; angle: number } {
  if (path.nodes.length === 0) return { position: [0, 0], angle: 0 };
  if (path.nodes.length === 1) return { position: path.nodes[0].position, angle: 0 };

  // Handle looping
  let t = progress;
  if (path.loop === 'loop') {
    t = ((t % 1) + 1) % 1;
  } else if (path.loop === 'pingPong') {
    const cycle = ((t % 2) + 2) % 2;
    t = cycle > 1 ? 2 - cycle : cycle;
  } else {
    t = Math.max(0, Math.min(1, t));
  }

  const segments = getSegments(path);
  const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
  if (totalLength === 0) return { position: path.nodes[0].position, angle: 0 };

  const targetDist = t * totalLength;
  let accumulated = 0;

  for (const seg of segments) {
    if (accumulated + seg.length >= targetDist || seg === segments[segments.length - 1]) {
      const localT = seg.length === 0 ? 0 : (targetDist - accumulated) / seg.length;
      const clampedT = Math.max(0, Math.min(1, localT));
      const position = cubicBezierPoint(seg.startNode.position, seg.cp1, seg.cp2, seg.endNode.position, clampedT);
      const tangent = cubicBezierTangent(seg.startNode.position, seg.cp1, seg.cp2, seg.endNode.position, clampedT);
      const angle = Math.atan2(tangent[1], tangent[0]) * (180 / Math.PI);
      return { position, angle };
    }
    accumulated += seg.length;
  }

  return { position: path.nodes[path.nodes.length - 1].position, angle: 0 };
}

export function evaluateMotionPathAtFrame(path: MotionPath, frame: number): { position: Vec2; angle: number } {
  const progress = evaluateNumber(path.progress, frame);
  return evaluatePathAtProgress(path, progress / 100);
}

export function getPathPoints(path: MotionPath, samples: number = 100): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const { position } = evaluatePathAtProgress(path, t);
    points.push(position);
  }
  return points;
}

export function autoSmoothNode(node: MotionPathNode, prev: MotionPathNode | null, next: MotionPathNode | null): MotionPathNode {
  if (!prev && !next) return { ...node, handleIn: [0, 0], handleOut: [0, 0], vertexType: 'smooth' };

  const tangent: Vec2 = [0, 0];
  if (prev && next) {
    tangent[0] = (next.position[0] - prev.position[0]) * 0.25;
    tangent[1] = (next.position[1] - prev.position[1]) * 0.25;
  } else if (next) {
    tangent[0] = (next.position[0] - node.position[0]) * 0.25;
    tangent[1] = (next.position[1] - node.position[1]) * 0.25;
  } else if (prev) {
    tangent[0] = (node.position[0] - prev.position[0]) * 0.25;
    tangent[1] = (node.position[1] - prev.position[1]) * 0.25;
  }

  return {
    ...node,
    handleIn: [-tangent[0], -tangent[1]],
    handleOut: [tangent[0], tangent[1]],
    vertexType: 'smooth',
  };
}

export function smoothEntirePath(path: MotionPath): MotionPathNode[] {
  return path.nodes.map((node, i) => {
    const prev = i > 0 ? path.nodes[i - 1] : (path.closed ? path.nodes[path.nodes.length - 1] : null);
    const next = i < path.nodes.length - 1 ? path.nodes[i + 1] : (path.closed ? path.nodes[0] : null);
    return autoSmoothNode(node, prev, next);
  });
}
