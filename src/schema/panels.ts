import { z } from 'zod/v4';
import { TRANSITION_TYPES } from './enums';
import { zId, zFrame, zVec2 } from './primitives';
import { zEasingName } from './easing';
import type { Caps } from './caps';

// PANELS are time ranges within ONE composition (not separate compositions). Layer membership lives
// on the layer (`panelId`, written by assembly), so it cannot desync.
//
// UNIFIED BOUNDARY CONTRACTS: a boundary is a single present-list — the element ids on screen at the
// panel's in-point / out-point. The Director plan and the compiled frame panel use the SAME shape
// (`inboundPresent` / `outboundPresent`), so there are no two representations to invent defaults
// between. Reconciliation (panel N.outbound == panel N+1.inbound) is checked in both the semantic
// validator (on the ms plan) and assembly (on the frame plan).
//
// LINE DRAWN (structural vs semantic): within-object bounds live here (a panel's end > start). CROSS-
// object invariants — panels contiguous & gapless, order unique, present-lists reconcile — are
// SEMANTIC (see src/schema/semantic.ts), not Zod.

export const zTransition = z
  .strictObject({
    type: z.enum(TRANSITION_TYPES),
    /** Transition length (0 = cut). Ms in the Director plan; frames in the compiled panel. */
    duration: z.int().min(0),
    easing: zEasingName.optional(),
    params: z.record(z.string(), z.number()).optional(),
  })
  .describe('a panel-to-panel transition');

/** Factory: a Panel (frames — document-facing). `start < end` is a within-object runtime guard. */
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
      /** Element ids on screen at the in-point / out-point (the unified boundary contract). */
      inboundPresent: z.array(zId).max(caps.maxLayersPerPanel),
      outboundPresent: z.array(zId).max(caps.maxLayersPerPanel),
    })
    .refine((p) => p.end > p.start, { message: 'panel end must be after start', path: ['end'] });
}

/** Factory: the ordered list of panels in a composition (≤ caps.maxPanels). */
export function makePanelList(caps: Caps) {
  return z.array(makePanel(caps)).max(caps.maxPanels);
}

export type Transition = z.infer<typeof zTransition>;
