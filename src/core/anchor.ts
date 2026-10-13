// Anchor point / pivot math (pure, no React/DOM/WebGPU) - the single source of truth for how a
// layer's `transform.anchorPoint` turns rotation and scale into a pivot around a chosen point
// instead of the layer centre. Proven by scripts/verify-anchor.mjs.
//
// SEMANTICS (After Effects model):
//   - `anchorPoint` is the pivot's offset from the layer's CENTRE, in UNSCALED layer pixels
//     (so it stays on the same point of the content as `scale` animates). Default [0,0] = centre.
//   - `position` is the composition-space location where that anchor point sits.
//   - rotation AND scale pivot about the anchor point.
//
// The GPU vertex shaders (RECT/IMAGE/TEXT/PATTERN) and the overlay's pathTransform all evaluate the
// SAME affine form (scale already folded into the local quad / path vertex):
//       world = position_in + R·(localScaled − anchor_in) + anchor_in
// Feeding that fixed pipeline the compensated pair
//       anchor_in   = scale · a
//       position_in = position − scale · a
// makes it compute
//       world = position + R·S·(u − a)
// i.e. the anchor is the pivot of both scale and rotation and sits exactly at `position`.
// With a = [0,0] the pair collapses to (anchor_in = 0, position_in = position): byte-identical to
// the pre-anchor behaviour (pivot at the centre), so every existing layer renders unchanged.
//
// NOTE: the 3D `mat4.composeModel` path (T(pos)·R·S·T(−anchor), anchor applied BEFORE scale) already
// pivots correctly from the RAW unscaled anchor, so it must NOT be fed the compensated pair - only
// the 2D quad / cardMVP / pathTransform pipelines (which carry scale INSIDE the local coord) do.

import type { ResolvedTransform, Vec2 } from './types';

/** Rotate a vector by `deg` degrees in the renderer's Y-down composition space. */
function rotateDeg(x: number, y: number, deg: number): Vec2 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [x * c - y * s, x * s + y * c];
}

/**
 * Convert an AE-authored resolved transform (`position` = anchor's world location, `anchorPoint` =
 * unscaled centre-relative pivot) into the compensated pair the fixed 2D render/overlay pipeline
 * consumes. Identity (returns the same object) when the anchor is at the centre, guaranteeing
 * byte-identical output for the default and every pre-anchor scene.
 */
export function applyPivotCompensation(t: ResolvedTransform): ResolvedTransform {
  if (t.anchorX === 0 && t.anchorY === 0) return t;
  const ax = t.scaleX * t.anchorX;
  const ay = t.scaleY * t.anchorY;
  return {
    ...t,
    positionX: t.positionX - ax,
    positionY: t.positionY - ay,
    anchorX: ax,
    anchorY: ay,
  };
}

/**
 * Composition-space offset from a layer's content centre to its anchor point, for the given scale
 * and rotation. The content centre is therefore `position − contentCenterOffset(...)`; the overlay
 * uses this to draw the selection box around the actual rendered content (not the anchor) and to
 * place the pivot handle. [0,0] when the anchor is centred.
 */
export function contentCenterOffset(
  scaleX: number,
  scaleY: number,
  anchorX: number,
  anchorY: number,
  rotationDeg: number,
): Vec2 {
  if (anchorX === 0 && anchorY === 0) return [0, 0];
  return rotateDeg(scaleX * anchorX, scaleY * anchorY, rotationDeg);
}

/**
 * New `position` that keeps the rendered content fixed in place when the anchor moves from
 * `oldAnchor` to `newAnchor` (the "pan-behind" / centre-anchor behaviour). Derived from the
 * content-fixed invariant `position − R·S·anchor = const`.
 */
export function compensatePosition(
  position: Vec2,
  oldAnchor: Vec2,
  newAnchor: Vec2,
  scaleX: number,
  scaleY: number,
  rotationDeg: number,
): Vec2 {
  const [dx, dy] = rotateDeg(
    scaleX * (newAnchor[0] - oldAnchor[0]),
    scaleY * (newAnchor[1] - oldAnchor[1]),
    rotationDeg,
  );
  return [position[0] + dx, position[1] + dy];
}

/**
 * Inverse of the layer's rotate·scale map applied to a composition-space delta: turns a pointer
 * movement in comp pixels into the matching movement in unscaled layer (anchor) pixels. Used by the
 * viewport pan-behind drag to know how far to move the anchor so its crosshair tracks the cursor.
 */
export function compDeltaToAnchorDelta(
  dx: number,
  dy: number,
  scaleX: number,
  scaleY: number,
  rotationDeg: number,
): Vec2 {
  const [rx, ry] = rotateDeg(dx, dy, -rotationDeg);
  return [rx / (scaleX || 1e-6), ry / (scaleY || 1e-6)];
}
