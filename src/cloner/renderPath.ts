// Cloner — render-path auto-selection (Prompt 3, Deliverable 4).
//
// Pure decision: which GPU strategy renders a cloner, as a function of the SOURCE's
// type (not per-frame data), so it can be memoized per cloner config. Kept decoupled
// from the core `Layer` union (which the cloner is not yet part of) by taking a small
// source descriptor the host fills in.

export type ClonerRenderPath =
  /** Simple SDF shape (rect/circle/star): instance the shared quad, one draw(6, N). */
  | 'instanced-shape'
  /** Anything reducible to "one look, rendered once, repeated": image/text/precomp/
   *  non-SDF vector → render source once to a texture, stamp N times. */
  | 'texture-stamp'
  /** RESERVED — content genuinely varies per instance (data-bound text/image lists).
   *  Needs full per-instance rendering; NOT handled by the renderer this prompt. */
  | 'per-instance';

export interface ClonerSourceInfo {
  /** The source layer's `type` (shape/text/image/video/group/…). */
  layerType: string;
  /** True only for the SDF primitives the instanced-shape path supports (rect/circle/star). */
  isSdfShape?: boolean;
  /** True when the source pulls per-instance content from a data list (deferred prompt). */
  isDataBound?: boolean;
}

/**
 * Choose the render path for a cloner's source. `per-instance` may be returned
 * (data-bound sources) but is deliberately NOT wired in the renderer yet — the
 * clean extension point; the renderer treats it as an explicit not-yet-supported
 * case rather than silently doing the wrong thing.
 */
export function selectClonerRenderPath(source: ClonerSourceInfo): ClonerRenderPath {
  if (source.isDataBound) return 'per-instance';
  if (source.layerType === 'shape' && source.isSdfShape) return 'instanced-shape';
  return 'texture-stamp';
}

/**
 * Per-strategy instance-count threshold above which scrub-time LOD degradation
 * (deterministic index-skip, Prompt 3 Deliverable 6) kicks in. Deliberately NOT a
 * single shared number: cost per instance differs by an order of magnitude across
 * paths, so `per-instance` (a full render each) degrades far earlier than the
 * single-draw-call `instanced-shape`. Values are placeholders — TODO(profile): tune
 * against the renderer's real frame budget once the GPU paths exist.
 */
export const CLONER_LOD_THRESHOLDS: Record<ClonerRenderPath, number> = {
  'instanced-shape': 2000, // one draw call regardless of N — rarely needs degrading
  'texture-stamp': 400, // per-stamp texture sampling — medium cost
  'per-instance': 50, // a full render per instance — most expensive, degrade earliest
};
