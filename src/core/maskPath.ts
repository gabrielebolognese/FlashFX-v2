// Freeform path mask resolution (B10c, foundation). Pure helpers that evaluate a mask's optional
// bezier outline + per-vertex feather for the current frame. Animated outlines reuse B8b's
// `evalPathKeyframes` (arc-length resample + correspondence - handles poses with different vertex
// counts). This is the DATA + MATH foundation only: the freeform-coverage SHADER that draws an
// arbitrary mask outline is the remaining browser-gated step (the shipping mask primitives are
// analytic SDFs and cannot draw a general polygon). Leaf-ish: imports only `evalPathKeyframes`
// (itself pure) + types → node-harnessable (`verify:mask-path`).

import type { PathVertex, PathKeyframe } from './types';
import { evalPathKeyframes } from './shapeModifiers';

/**
 * The mask's outline at `frame`: the morphed pose when `pathKeyframes` are present (≥1), else the
 * static `vertices` (or []). Masks are closed, so only the vertices are returned.
 */
export function resolveMaskVertices(vertices: PathVertex[] | undefined, pathKeyframes: PathKeyframe[] | undefined, frame: number): PathVertex[] {
  if (pathKeyframes && pathKeyframes.length > 0) return evalPathKeyframes(pathKeyframes, frame).vertices;
  return vertices ? vertices.map((v) => v) : [];
}

/**
 * Per-vertex feather for `vertexCount` vertices: the authored `feathers` clamped ≥0 and padded/truncated
 * to the vertex count (missing entries use `fallback`, the mask's single feather). Absent → a uniform
 * `fallback` array. Non-negative so the coverage never inverts.
 */
export function resolveMaskFeathers(feathers: number[] | undefined, vertexCount: number, fallback: number): number[] {
  const base = Math.max(0, fallback);
  if (!feathers || feathers.length === 0) return new Array(Math.max(0, vertexCount)).fill(base);
  const out: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const f = feathers[i];
    out.push(Math.max(0, typeof f === 'number' ? f : base));
  }
  return out;
}
