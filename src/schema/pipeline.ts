import { z } from 'zod/v4';
import { AI_LAYER_TYPES, OUTPUT_FORMATS, TONES } from './enums';
import { zId, zNamespacedId, zSemanticName, zMs, zVec2 } from './primitives';
import { makeStyleContract } from './styleContract';
import { makePanel, makePanelList, zTransition, zBoundaryContract } from './panels';
import { makeAiLayer } from './layers';
import type { Caps } from './caps';

// The pipeline's intermediate contracts as first-class schemas. UNIT DISCIPLINE (the corrected
// invariant): PLANNING contracts carry ms (human-scale planning + audio sync), everything DOCUMENT-
// facing (jobs, panels, the Coder fragment) carries integer FRAMES. Job-expansion converts ONCE by
// deriving an integer beat in frames and rebuilding the panel grid from it — the Coder never sees ms.

// ── Director ──
export function makeBrief(caps: Caps) {
  return z
    .strictObject({
      /** The Director DECIDES rather than asks; committed total duration in ms (planning). */
      durationMs: zMs.refine((v) => v > 0, 'duration must be > 0'),
      format: z.enum(OUTPUT_FORMATS),
      tone: z.enum(TONES),
      /** The subject inventory it commits to (can't exceed the total layer budget). */
      subjects: z.array(z.strictObject({ id: zNamespacedId, name: zSemanticName })).min(1).max(caps.maxLayersTotal),
    })
    .describe('the Director brief (commits duration/format/subjects/tone; ms)');
}

/** A Director panel (ms plan). Boundary contracts here are coarse — the element ids present at each
 *  boundary — enough to fan out jobs; the assembled frame Panel carries the richer state contract. */
export function makeDirectorPanel(caps: Caps) {
  return z.strictObject({
    id: zId,
    order: z.int().min(0),
    startMs: zMs,
    endMs: zMs,
    focalPoint: zVec2.optional(),
    elements: z
      .array(z.strictObject({ id: zNamespacedId, name: zSemanticName, kind: z.enum(AI_LAYER_TYPES) }))
      .max(caps.maxLayersPerPanel),
    transitionIn: zTransition.optional(),
    inboundPresent: z.array(zId),
    outboundPresent: z.array(zId),
  });
}

export function makeDirectorPanelPlan(caps: Caps) {
  return z.array(makeDirectorPanel(caps)).min(1).max(caps.maxPanels);
}

/** The Director's combined single-call output: brief + style contract + panel plan (all ms). */
export function makeDirectorOutput(caps: Caps) {
  return z
    .strictObject({
      brief: makeBrief(caps),
      styleContract: makeStyleContract(caps),
      panelPlan: makeDirectorPanelPlan(caps),
    })
    .describe("the Director's combined output (brief + style contract + panel plan; ms)");
}

// ── Per-panel job (deterministic job-expansion output; FRAMES) ──
export function makeJob(caps: Caps) {
  return z
    .strictObject({
      requestId: zId,
      panelId: zId,
      styleContract: makeStyleContract(caps),
      /** This panel, converted to frames. */
      panel: makePanel(caps),
      /** The neighbouring boundary contracts the Coder must honour (frames). */
      neighbors: z.strictObject({
        prevOutbound: zBoundaryContract.optional(),
        nextInbound: zBoundaryContract.optional(),
      }),
      /** The allocated id namespace prefix, e.g. "p2:". Coder ids MUST start with it and survive
       *  assembly verbatim (never re-minted). */
      idNamespace: z.string().regex(/^[A-Za-z0-9_-]+:$/, 'namespace must look like "p2:"'),
      layerBudget: z.int().min(1).max(caps.maxLayersPerPanel),
    })
    .describe('a self-contained per-panel job (frames)');
}

// ── Coder fragment (what one Coder call emits; FRAMES). THE constrained-decoding target. ──
export function makeCoderFragment(caps: Caps) {
  return z
    .strictObject({
      panelId: zId,
      layers: z.array(makeAiLayer(caps)).max(caps.maxLayersPerPanel),
    })
    .describe('the fragment one Coder call emits: this panel\'s layers only');
}

export type DirectorOutput = z.infer<ReturnType<typeof makeDirectorOutput>>;
export type Job = z.infer<ReturnType<typeof makeJob>>;
export type CoderFragment = z.infer<ReturnType<typeof makeCoderFragment>>;
// Re-export for aiMeta (document.ts) without a cycle: document imports pipeline, not vice-versa.
export { makePanelList };
