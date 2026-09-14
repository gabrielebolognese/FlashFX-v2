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
 * Frame-mix split: the two adjacent source frames straddling `seconds` and the cross-dissolve `mix`
 * (0..1) between them. `mix` is 0 on an exact frame or when clamped at the last frame (no next frame
 * to blend toward), so a blend never invents content past the source. Pure — the renderer expands a
 * frame-blended clip into frameA (opaque) + frameB (opacity = mix) using this.
 */
export function frameBlendSplit(seconds: number, sourceFps: number, totalSourceFrames: number): { frameA: number; frameB: number; mix: number } {
  const exact = seconds * sourceFps;
  const last = Math.max(0, totalSourceFrames - 1);
  if (!Number.isFinite(exact)) return { frameA: 0, frameB: 0, mix: 0 };
  const clamped = exact < 0 ? 0 : exact > last ? last : exact;
  const frameA = Math.floor(clamped);
  const frameB = Math.min(frameA + 1, last);
  const mix = frameB === frameA ? 0 : clamped - frameA;
  return { frameA, frameB, mix };
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
