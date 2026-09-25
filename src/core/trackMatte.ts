// Track mattes (B10b) - one layer mattes the layer directly BELOW it (AE model): the matte layer's
// alpha (or luminance), optionally inverted, cuts out the layer under it, and the matte layer itself
// is consumed (not drawn on its own). This module is the PURE pairing logic: given the render-ordered
// layers, work out which layer mattes which and which are consumed. The actual pixel composite (sample
// the matte's alpha/luma and multiply) is a WebGPU pass wired in the renderer (browser-gated). Leaf
// module - no imports - so it bundles in a node harness (`verify:mattes`).

export type TrackMatteMode = 'alpha' | 'alphaInv' | 'luma' | 'lumaInv';

export interface MatteRef {
  mode: TrackMatteMode;
  /** The layer id whose alpha/luma is used as the matte (the layer directly above). */
  sourceId: string;
}

export interface TrackMattePairing {
  /** matted layer id → the matte it uses. */
  matted: Record<string, MatteRef>;
  /** layer ids consumed AS a matte (drawn into the matte, not composited on their own). */
  consumed: Set<string>;
}

/**
 * Pair each layer that has a `trackMatte` mode with the layer directly ABOVE it in the stack (its
 * matte source), and mark that source consumed. `ordered` is BOTTOM→TOP render order (index 0 draws
 * first / is lowest); the matte for `ordered[i]` is `ordered[i+1]`. A track matte on the topmost layer
 * (no layer above) is ignored. A layer already consumed as someone's matte can't also be a matte
 * target's source twice - first assignment wins (deterministic by stack position).
 */
export function pairTrackMattes(ordered: { id: string; trackMatte?: TrackMatteMode | null }[]): TrackMattePairing {
  const matted: Record<string, MatteRef> = {};
  const consumed = new Set<string>();
  for (let i = 0; i < ordered.length; i++) {
    const mode = ordered[i].trackMatte;
    if (!mode) continue;
    const source = ordered[i + 1]; // the layer directly above
    if (!source) continue; // topmost layer with a matte set → nothing above → ignore
    if (consumed.has(source.id)) continue; // already someone's matte
    matted[ordered[i].id] = { mode, sourceId: source.id };
    consumed.add(source.id);
  }
  return { matted, consumed };
}

/** Whether a matte mode uses luminance (else alpha), and whether it is inverted - for the shader. */
export function matteFlags(mode: TrackMatteMode): { luma: boolean; invert: boolean } {
  return {
    luma: mode === 'luma' || mode === 'lumaInv',
    invert: mode === 'alphaInv' || mode === 'lumaInv',
  };
}

/** Rec.709 luma of a 0..1 rgb triple - the luminance a luma matte keys on. The WGSL composite mirrors it. */
export function matteLuma(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

/**
 * The coverage multiplier a track matte applies to the matted layer's alpha (B10d), from the matte
 * source pixel's alpha + luma and the mode flags: alpha/luma pick the channel, invert flips it, clamped
 * to 0..1. keptAlpha = mattedAlpha * matteCoverage(...). This is the exact expression the WGSL composite
 * shader implements - single source of truth, harnessed by verify:mattes.
 */
export function matteCoverage(srcAlpha: number, srcLuma: number, flags: { luma: boolean; invert: boolean }): number {
  let c = flags.luma ? srcLuma : srcAlpha;
  if (flags.invert) c = 1 - c;
  return c < 0 ? 0 : c > 1 ? 1 : c;
}
