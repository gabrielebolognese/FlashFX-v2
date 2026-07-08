import type { ResolvedTransform, Vec2, Layer } from '../core/types';
import { evaluateVec2, evaluateNumber } from '../core/interpolation';

// Resolve a layer's transform to concrete values at a given frame.
export function resolveXform(layer: Layer, frame: number): ResolvedTransform {
  const pos = evaluateVec2(layer.transform.position, frame);
  const scale = evaluateVec2(layer.transform.scale, frame);
  const anchor = evaluateVec2(layer.transform.anchorPoint, frame);
  return {
    positionX: pos[0],
    positionY: pos[1],
    scaleX: scale[0],
    scaleY: scale[1],
    anchorX: anchor[0],
    anchorY: anchor[1],
    rotation: evaluateNumber(layer.transform.rotation, frame),
    opacity: evaluateNumber(layer.transform.opacity, frame),
  };
}

// Coordinate transforms between layer-local path space and composition space.
// These mirror the path vertex shader exactly:
//   scaled  = pos * scale
//   rel     = scaled - anchor
//   rotated = rotate(rel, rotation)
//   world   = rotated + anchor + position
// so that overlay interaction maps 1:1 with rendered geometry.

function rotate(v: Vec2, rad: number): Vec2 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

export function localToComp(t: ResolvedTransform, p: Vec2): Vec2 {
  const rad = t.rotation * (Math.PI / 180);
  const scaled: Vec2 = [p[0] * t.scaleX, p[1] * t.scaleY];
  const rel: Vec2 = [scaled[0] - t.anchorX, scaled[1] - t.anchorY];
  const rotated = rotate(rel, rad);
  return [
    rotated[0] + t.anchorX + t.positionX,
    rotated[1] + t.anchorY + t.positionY,
  ];
}

export function compToLocal(t: ResolvedTransform, p: Vec2): Vec2 {
  const rad = t.rotation * (Math.PI / 180);
  const rotated: Vec2 = [p[0] - t.anchorX - t.positionX, p[1] - t.anchorY - t.positionY];
  const rel = rotate(rotated, -rad);
  const scaled: Vec2 = [rel[0] + t.anchorX, rel[1] + t.anchorY];
  return [
    scaled[0] / (t.scaleX || 1e-6),
    scaled[1] / (t.scaleY || 1e-6),
  ];
}

// Direction-only transforms (for handle deltas): no translation.
export function localVecToComp(t: ResolvedTransform, v: Vec2): Vec2 {
  const rad = t.rotation * (Math.PI / 180);
  return rotate([v[0] * t.scaleX, v[1] * t.scaleY], rad);
}

export function compVecToLocal(t: ResolvedTransform, v: Vec2): Vec2 {
  const rad = t.rotation * (Math.PI / 180);
  const r = rotate(v, -rad);
  return [r[0] / (t.scaleX || 1e-6), r[1] / (t.scaleY || 1e-6)];
}
