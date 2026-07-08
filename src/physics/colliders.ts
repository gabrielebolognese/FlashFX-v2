import type { ColliderConfig } from './types';
import type { PathVertex } from '../core/types';

export function colliderFromBoundingBox(width: number, height: number): ColliderConfig {
  return { mode: 'boundingBox', widthOverride: width, heightOverride: height };
}

export function colliderFromBoundingCircle(width: number, height: number): ColliderConfig {
  const radius = Math.max(width, height) / 2;
  return { mode: 'boundingCircle', radiusOverride: radius };
}

export function colliderFromConvexHull(points: [number, number][]): ColliderConfig {
  if (points.length < 3) return { mode: 'boundingBox' };
  const hull = computeConvexHull(points);
  return { mode: 'convexHull', manualPoints: hull };
}

export function colliderFromPolyline(points: [number, number][]): ColliderConfig {
  if (points.length < 2) return { mode: 'boundingBox' };
  return { mode: 'polyline', manualPoints: points };
}

export function colliderFromPathVertices(vertices: PathVertex[], closed: boolean): ColliderConfig {
  const points: [number, number][] = vertices.map((v) => [v.position[0], v.position[1]]);
  if (closed && points.length >= 3) {
    return colliderFromConvexHull(points);
  }
  return colliderFromPolyline(points);
}

function computeConvexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return [...points];

  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
