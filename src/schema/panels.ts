import { z } from 'zod/v4';
import { TRANSITION_TYPES } from './enums';
import { zId, zFrame, zVec2, zUnit } from './primitives';
import { zEasingName } from './easing';
import type { Caps } from './caps';

// PANELS are time ranges within ONE composition (not separate compositions). Layer membership lives
// on the layer (`panelId`), so it cannot desync; the panel additionally declares its boundary state
// contracts — what is on screen (and in what coarse state) at its in-point and out-point — which is
// what lets panel fan-out (each Coder call sees its neighbours' boundaries) and later per-panel
// regeneration reconcile seams as a HARD error rather than a visual surprise.
//
// LINE DRAWN (structural vs semantic): within-object bounds live here (a panel's end > start; a
// boundary's frame is an int). CROSS-object invariants — panels contiguous & gapless, panel order
// unique, every boundary layerId resolves, and panel N's outbound == panel N+1's inbound — are
// SEMANTIC and belong in the separate semantic validator, NOT in Zod. They are cross-element and
// reference-resolving; forcing them into refinements would neither survive JSON-Schema export nor
// belong at parse time.

export const zTransition = z
  .strictObject({
    type: z.enum(TRANSITION_TYPES),
    /** Transition length in frames (0 = cut). */
    duration: z.int().min(0),
    easing: zEasingName.optional(),
    params: z.record(z.string(), z.number()).optional(),
  })
  .describe('a panel-to-panel transition (expands to real keyframes at preset expansion)');

/** One layer's coarse state at a panel boundary — enough to reconcile a seam, not a full transform. */
export const zBoundaryState = z.strictObject({
  layerId: zId,
  present: z.boolean(),
  opacity: zUnit,
  position: zVec2.optional(),
});

/** The set of on-screen layer states at a single boundary frame. */
export const zBoundaryContract = z.strictObject({
  atFrame: zFrame,
  states: z.array(zBoundaryState),
});

/** Factory: a Panel (frames — document-facing). Boundary state count is bounded by the per-panel
 *  layer cap. `start < end` is a within-object runtime guard (dropped from JSON Schema, as intended). */
export function makePanel(caps: Caps) {
  return z
    .strictObject({
      id: zId,
      order: z.int().min(0),
      start: zFrame,
      end: zFrame,
      focalPoint: zVec2.optional(),
      /** Transition INTO this panel from the previous one (absent on the first panel / hard cuts). */
      transitionIn: zTransition.optional(),
      inbound: zBoundaryContract.extend({ states: z.array(zBoundaryState).max(caps.maxLayersPerPanel) }),
      outbound: zBoundaryContract.extend({ states: z.array(zBoundaryState).max(caps.maxLayersPerPanel) }),
    })
    .refine((p) => p.end > p.start, { message: 'panel end must be after start', path: ['end'] });
}

/** Factory: the ordered list of panels in a composition (≤ caps.maxPanels). Contiguity/gapless is a
 *  SEMANTIC check (see header) — not enforced here. */
export function makePanelList(caps: Caps) {
  return z.array(makePanel(caps)).max(caps.maxPanels);
}

export type Transition = z.infer<typeof zTransition>;
export type BoundaryContract = z.infer<typeof zBoundaryContract>;
