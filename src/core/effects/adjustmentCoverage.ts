// Adjustment-layer coverage resolver (B11b, pure leaf - imports nothing runtime).
//
// An adjustment layer applies its effect stack to everything rendered BELOW it. Given the layers in
// RENDER order (back-to-front: index 0 is drawn first / sits lowest), this computes which content
// layers each active adjustment covers, so the renderer knows what to feed its apply-below pass and
// can skip adjustments that change nothing, and the UI can show the coverage.
//
// Frame purity: the caller precomputes each layer's `active` flag (visible AND within [inPoint,
// outPoint) at the queried frame) and, for adjustments, `hasEffects` (its resolved stack is
// non-empty). This module is then a pure function of that ordered list - no time, no globals.

export interface AdjustmentLayerRef {
  id: string;
  /** True for an adjustment layer. */
  isAdjustment: boolean;
  /** Active at the queried frame: visible AND within its in/out range. Inactive layers are ignored. */
  active: boolean;
  /** Adjustments only: does the resolved effect stack have at least one enabled effect? */
  hasEffects?: boolean;
}

export interface AdjustmentCoverage {
  adjustmentId: string;
  /** Position of the adjustment in the render-ordered input. */
  index: number;
  /** Active content (non-adjustment) layer ids rendered below this adjustment, in render order. */
  coveredLayerIds: string[];
  /** coveredLayerIds.length. */
  coveredCount: number;
  /** True when the adjustment changes nothing this frame (nothing below, or no active effects). */
  noOp: boolean;
}

/**
 * Compute per-adjustment coverage from the render-ordered layers (index 0 = lowest/drawn first).
 * Each active adjustment covers every active content layer below it - including content that sits
 * below a lower adjustment (adjustments stack: the renderer applies the lower one first, so a higher
 * one operates on the already-adjusted composite, but the raw content ids it sits above are still
 * what it "covers"). Inactive layers (adjustment or content) are skipped entirely.
 */
export function resolveAdjustmentCoverage(ordered: AdjustmentLayerRef[]): AdjustmentCoverage[] {
  const out: AdjustmentCoverage[] = [];
  const belowContent: string[] = []; // active content ids accumulated as we walk upward

  for (let i = 0; i < ordered.length; i++) {
    const l = ordered[i];
    if (l.isAdjustment) {
      if (!l.active) continue; // inactive adjustment: no coverage, does not consume content below
      const covered = belowContent.slice();
      out.push({
        adjustmentId: l.id,
        index: i,
        coveredLayerIds: covered,
        coveredCount: covered.length,
        noOp: covered.length === 0 || l.hasEffects === false,
      });
      // An adjustment is not content - it never enters belowContent.
    } else if (l.active) {
      belowContent.push(l.id);
    }
  }
  return out;
}

/** The adjustments that actually do something this frame (drive the GPU apply-below passes). */
export function activeAdjustments(coverage: AdjustmentCoverage[]): AdjustmentCoverage[] {
  return coverage.filter((c) => !c.noOp);
}

/** Whether any adjustment this frame needs an apply-below pass (fast bail for the renderer). */
export function hasActiveAdjustments(coverage: AdjustmentCoverage[]): boolean {
  return coverage.some((c) => !c.noOp);
}
