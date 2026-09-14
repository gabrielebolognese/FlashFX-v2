// Pure comp-frame → source-time retiming for video layers. This is the shared model behind constant
// speed, freeze, reverse, and animated Time Remap / speed ramps. It takes plain numbers only (no
// interpolation, no engine/video), so it's a leaf module and fully node-harnessable; the resolver in
// core/interpolation.ts evaluates any animated remap curve and then calls these helpers.

/**
 * Source time in SECONDS for the classic constant-rate path (byte-identical to the historical
 * mapping). `reversed` reflects the query frame within [inPoint, outPoint] before the mapping.
 */
export function linearSourceSeconds(
  compFrame: number,
  inPoint: number,
  outPoint: number,
  startOffset: number,
  compFps: number,
  playbackRate: number,
  reversed: boolean,
): number {
  const eff = reversed ? inPoint + outPoint - compFrame : compFrame;
  const localFrame = eff - inPoint + startOffset;
  return (localFrame / (compFps || 1)) * playbackRate;
}

/** Convert source SECONDS to a clamped integer source-frame index. */
export function sourceFrameFromSeconds(seconds: number, sourceFps: number, totalSourceFrames: number): number {
  const f = Math.floor(seconds * sourceFps);
  if (!Number.isFinite(f)) return 0;
  const last = Math.max(0, totalSourceFrames - 1);
  return f < 0 ? 0 : f > last ? last : f;
}

/**
 * The two identity seed values (source seconds at the clip's in/out points) used when Time Remap is
 * first enabled — a straight line reproducing the current constant-rate playback, so enabling it
 * changes nothing until the user shapes the curve (speed ramp / freeze / reverse).
 */
export function identityRemapSeconds(
  inPoint: number,
  outPoint: number,
  startOffset: number,
  compFps: number,
  playbackRate: number,
): { atIn: number; atOut: number } {
  return {
    atIn: linearSourceSeconds(inPoint, inPoint, outPoint, startOffset, compFps, playbackRate, false),
    atOut: linearSourceSeconds(outPoint, inPoint, outPoint, startOffset, compFps, playbackRate, false),
  };
}
