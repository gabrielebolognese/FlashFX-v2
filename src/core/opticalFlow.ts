// Pure helpers for optical-flow retiming (B6). The actual flow ESTIMATOR + WARP are WebGPU fragment
// passes (B6b, browser-gated); these node-testable helpers pick the frame pair, the warp blend
// factor, and the flow-field cache key so a flow field isn't recomputed on every scrub. Leaf module -
// no engine/WebGPU imports - so it bundles in a harness.

export type RetimeInterp = 'mix' | 'flow';

/** Warp blend factor between frameA and frameB (0 = all A, 1 = all B). Clamped to [0,1]. */
export function warpT(mix: number): number {
  return mix < 0 ? 0 : mix > 1 ? 1 : mix;
}

/**
 * Cache key for a computed flow field - unique per (asset, ordered frame pair, resolution, quality).
 * Keying on the pair (not the comp frame) means scrubbing back and forth reuses the same flow field.
 */
export function flowFieldKey(assetId: string, frameA: number, frameB: number, width: number, height: number, quality: number): string {
  return `flow:${assetId}|${frameA}->${frameB}|${Math.round(width)}x${Math.round(height)}|q${quality}`;
}

/**
 * Whether a retimed sample warrants a flow WARP this frame: flow mode is selected AND we're genuinely
 * between two distinct source frames. Otherwise the caller draws the single frame (or frame-mix).
 */
export function shouldWarp(interp: RetimeInterp | undefined, frameA: number, frameB: number | undefined, mix: number | undefined): boolean {
  return interp === 'flow' && frameB != null && frameB !== frameA && (mix ?? 0) > 1e-4;
}
