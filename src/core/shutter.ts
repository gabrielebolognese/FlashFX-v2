// Composition motion-blur "shutter" maths. The composition Shutter Angle is the global streak
// length (180° = the filmic default; low = crisp, high = long dreamy smears); each layer's own
// motion-blur shutter acts as a relative factor (180 = neutral 1×) so existing per-layer values
// render identically while the comp angle scales everything. Shutter Phase shifts WHERE the blur
// sits relative to the frame (0 = centred, negative = trails, positive = leads). Pure leaf module.

import type { ResolvedMotionBlur, ResolvedTransform } from './types';

export const DEFAULT_SHUTTER_ANGLE = 180;

/** Effective per-layer shutter angle in degrees, clamped to [0, 360]. */
export function effectiveShutterAngle(compAngle: number | undefined, layerShutter: number | undefined): number {
  const c = compAngle ?? DEFAULT_SHUTTER_ANGLE;
  const l = layerShutter ?? DEFAULT_SHUTTER_ANGLE;
  const v = c * (l / DEFAULT_SHUTTER_ANGLE);
  return v < 0 ? 0 : v > 360 ? 360 : v;
}

/** Shutter phase as a fraction of the streak window (added to the centred sample offset in the
 *  shader): 0 = centred on the frame, negative = trailing, positive = leading. */
export function shutterPhaseFraction(phaseDeg: number | undefined, effectiveAngleDeg: number): number {
  if (!phaseDeg || effectiveAngleDeg <= 0) return 0;
  return phaseDeg / effectiveAngleDeg;
}

/**
 * The per-frame motion-blur descriptor between two resolved transforms of the same drawable (this
 * frame and the previous one): pivot velocity, angular velocity and relative scale rate, which the
 * renderer's directional blur pass samples along. Undefined when nothing moved (the zero-cost path).
 * Shared by whole layers (computeMotionBlur) and per-glyph text stamps, whose motion comes from the
 * text animators rather than the layer transform.
 */
export function motionBlurBetween(
  current: ResolvedTransform,
  prev: ResolvedTransform,
  shutter: number,
  phase: number,
): ResolvedMotionBlur | undefined {
  const pivotX = current.positionX + current.anchorX;
  const pivotY = current.positionY + current.anchorY;
  const vx = pivotX - (prev.positionX + prev.anchorX);
  const vy = pivotY - (prev.positionY + prev.anchorY);
  const omega = (current.rotation - prev.rotation) * Math.PI / 180;
  const scaleRateX = current.scaleX !== 0 ? (current.scaleX - prev.scaleX) / current.scaleX : 0;
  const scaleRateY = current.scaleY !== 0 ? (current.scaleY - prev.scaleY) / current.scaleY : 0;

  const moving =
    Math.abs(vx) > 1e-4 || Math.abs(vy) > 1e-4 ||
    Math.abs(omega) > 1e-5 ||
    Math.abs(scaleRateX) > 1e-5 || Math.abs(scaleRateY) > 1e-5;
  if (!moving) return undefined;

  return { shutter, phase, pivotX, pivotY, vx, vy, omega, scaleRateX, scaleRateY };
}
