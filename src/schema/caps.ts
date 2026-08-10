// Hard caps, enforced at PARSE time (as `.max(...)` on the relevant fields), configurable per
// tier. See ./layers.ts / ./pipeline.ts where these are threaded into the schemas.
//
// FACTORY vs VALUE — the decision, stated:
//   Caps are a FACTORY input (`makeSchemas(caps)`), not a module-level value. Rationale: the caps
//   are per-tier and must appear as concrete `.max()` bounds in the *parsed* schema AND in the
//   exported JSON Schema (so constrained decoding itself refuses an over-budget document). A single
//   module-level schema could only bake ONE tier's numbers. The cost of the factory: JSON Schema
//   for constrained decoding must be generated per tier (`toJSONSchema(makeSchemas(tierCaps)...)`),
//   and the derived TS *types* are taken from one canonical bundle (`defaultSchemas`) because caps
//   are runtime bounds, not type-level distinctions — the shape of a free-tier document and a pro-
//   tier document is identical; only the numeric limits differ. So: types come from the default
//   bundle, limits come from the factory. This keeps `z.infer` stable while limits stay per-tier.

export interface Caps {
  /** Max panels in one composition's plan. */
  maxPanels: number;
  /** Max layers the Coder may emit for a single panel/job. */
  maxLayersPerPanel: number;
  /** Max layers in the whole assembled document (across panels). */
  maxLayersTotal: number;
  /** Max composition duration, in frames. */
  maxDurationFrames: number;
  /** Max keyframes on a single property track. */
  maxKeyframesPerTrack: number;
  /** Hard cap on a cloner's produced instances (mirrors ClonerLayer.renderCount enforcement). */
  maxClonerInstances: number;
  /** Max effectors stacked on one cloner. */
  maxEffectorsPerCloner: number;
  /** Max palette roles a style contract may define (bounded so the prompt stays small). */
  maxPaletteEntries: number;
  /** Max ops in a single edit-path patch. */
  maxPatchOps: number;
}

/** The default (mid) tier. Every field is a hard parse-time bound, not a suggestion. */
export const DEFAULT_CAPS: Caps = {
  maxPanels: 12,
  maxLayersPerPanel: 40,
  maxLayersTotal: 300,
  maxDurationFrames: 60 * 60, // 60s @ 60fps
  maxKeyframesPerTrack: 64,
  maxClonerInstances: 2000,
  maxEffectorsPerCloner: 8,
  maxPaletteEntries: 16,
  maxPatchOps: 64,
};

export const TIER_CAPS: Record<'free' | 'pro' | 'max', Caps> = {
  free: {
    maxPanels: 4, maxLayersPerPanel: 20, maxLayersTotal: 60, maxDurationFrames: 30 * 30,
    maxKeyframesPerTrack: 32, maxClonerInstances: 300, maxEffectorsPerCloner: 4,
    maxPaletteEntries: 10, maxPatchOps: 32,
  },
  pro: DEFAULT_CAPS,
  max: {
    maxPanels: 24, maxLayersPerPanel: 80, maxLayersTotal: 800, maxDurationFrames: 120 * 60,
    maxKeyframesPerTrack: 128, maxClonerInstances: 8000, maxEffectorsPerCloner: 16,
    maxPaletteEntries: 24, maxPatchOps: 128,
  },
};

export function capsForTier(tier: keyof typeof TIER_CAPS): Caps {
  return TIER_CAPS[tier];
}

// ONE frozen, most-permissive cap set for the CONSTRAINED-DECODING schema (the tool definition).
// Decision (revised): a per-tier decode schema means a per-tier tool definition, which fragments the
// prompt cache into separate prefixes — and a cold cache WRITE costs ~10× a read. So decoding always
// uses this single frozen ceiling; the model can technically emit up to it. Per-TIER budget is
// enforced elsewhere — in the job spec (layerBudget) and the semantic validator — because an
// over-budget document is a rare, deterministically fixable failure, unlike an invalid enum which
// constrained decoding must prevent structurally. Keep this a strict superset of every TIER_CAPS.
export const DECODE_CAPS: Caps = {
  maxPanels: 32,
  maxLayersPerPanel: 120,
  maxLayersTotal: 1200,
  maxDurationFrames: 240 * 60,
  maxKeyframesPerTrack: 256,
  maxClonerInstances: 20000,
  maxEffectorsPerCloner: 24,
  maxPaletteEntries: 32,
  maxPatchOps: 256,
};
