import type { Vec2 } from './types';

// Pure tangent-handle mirroring for vector edit mode. Given the handle being dragged
// and the opposite handle's current vector, returns the new opposite handle for the
// vertex's mode (Figma/Sketch model), or null to leave it untouched. Alt-drag is
// handled by the caller passing mode='independent' for that one drag.
// Dependency-free + deterministic (scripts/verify-tangent.mjs).

export type HandleMode = 'mirrored' | 'angle' | 'independent';

/** Default handle mode for a legacy vertex without an explicit mode: a corner has
 *  no linked handles; a smooth/bezier point mirrors angle+length (Figma's default). */
export function defaultHandleMode(vertexType: 'corner' | 'smooth' | 'bezier'): HandleMode {
  return vertexType === 'corner' ? 'independent' : 'mirrored';
}

/**
 * The opposite tangent for `mode` when `dragged` is the handle being moved:
 * - 'mirrored'    → equal-and-opposite (angle + length locked): -dragged.
 * - 'angle'       → opposite angle, keeps the opposite handle's OWN length.
 * - 'independent' → null (leave the opposite handle alone).
 * A degenerate zero-length input falls back to a plain mirror.
 */
export function computeOppositeHandle(mode: HandleMode, dragged: Vec2, oppositeCurrent: Vec2): Vec2 | null {
  if (mode === 'independent') return null;
  // `+ 0` normalizes -0 → 0 so handles never carry a negative zero.
  const mirror: Vec2 = [-dragged[0] + 0, -dragged[1] + 0];
  if (mode === 'mirrored') return mirror;
  // 'angle': opposite points the other way but retains its current length.
  const len = Math.hypot(oppositeCurrent[0], oppositeCurrent[1]);
  const dl = Math.hypot(dragged[0], dragged[1]);
  if (dl === 0 || len === 0) return mirror;
  return [(-dragged[0] / dl) * len + 0, (-dragged[1] / dl) * len + 0];
}
