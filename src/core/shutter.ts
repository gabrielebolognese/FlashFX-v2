// Composition motion-blur "shutter" maths. The composition Shutter Angle is the global streak
// length (180° = the filmic default; low = crisp, high = long dreamy smears); each layer's own
// motion-blur shutter acts as a relative factor (180 = neutral 1×) so existing per-layer values
// render identically while the comp angle scales everything. Shutter Phase shifts WHERE the blur
// sits relative to the frame (0 = centred, negative = trails, positive = leads). Pure leaf module.

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
