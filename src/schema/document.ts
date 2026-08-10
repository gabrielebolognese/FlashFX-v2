import { z } from 'zod/v4';
import { zId, zFrame, zColorLiteral } from './primitives';
import { zDocumentLayer } from './layers';
import { makePanelList } from './panels';
import { makeStyleContract } from './styleContract';
import { makeBrief, makeDirectorPanelPlan } from './pipeline';
import type { Caps } from './caps';

// The DOCUMENT round-trip schema. Core structure is validated; rich/optional payloads and the many
// composition-level binding arrays (procedural/anchor/physics/stagger) PASS THROUGH via loose
// objects, so a hand-authored scene round-trips LOSSLESSLY. This is preserve-not-lock (see summary):
// the AI-authoring schemas are the strict, hallucination-proof ones; the document schema's job here
// is faithful round-trip, not field-locking every legacy config.

const zSettings = z.looseObject({
  width: z.int().positive(),
  height: z.int().positive(),
  frameRate: z.number().positive(),
  durationFrames: z.int().min(0),
  minimumDurationFrames: z.int().min(0).optional(),
  backgroundColor: zColorLiteral,
});

const zTrack = z.looseObject({
  id: zId,
  name: z.string(),
  type: z.string(),
  order: z.number(),
  locked: z.boolean(),
  visible: z.boolean(),
});

const zSharedStyle = z.looseObject({
  id: zId,
  name: z.string(),
  type: z.enum(['color', 'text', 'effect']),
  value: z.unknown(),
});

export function makeComposition(caps: Caps) {
  return z.looseObject({
    id: zId,
    name: z.string(),
    settings: zSettings,
    layers: z.array(zDocumentLayer),
    tracks: z.array(zTrack),
    /** AI panels (frames) — time ranges within THIS composition. Optional: hand scenes have none. */
    panels: makePanelList(caps).optional(),
    // background / motionPaths / markers / *Bindings are preserved by loose().
  });
}

/** The AI regeneration inputs persisted ON the document (not in flat project metadata) so the edit
 *  path's required inputs travel with the file. `panelPlan` is the Director's ORIGINAL ms plan. */
export function makeAiMeta(caps: Caps) {
  return z
    .strictObject({
      brief: makeBrief(),
      styleContract: makeStyleContract(),
      panelPlan: makeDirectorPanelPlan(caps),
      seed: z.int().describe('run seed — generation must be reproducible from it'),
      digest: z.string().min(1).describe('content digest of the generating inputs'),
      tier: z.enum(['free', 'pro', 'max']).optional(),
    })
    .describe('AI generation metadata persisted on the document (edit-path inputs)');
}

export function makeSceneDocument(caps: Caps) {
  return z
    .looseObject({
      version: z.int().min(1),
      rootCompositionId: zId,
      scenes: z.array(zId).optional(),
      compositions: z.record(zId, makeComposition(caps)),
      styles: z.record(zId, zSharedStyle).optional(),
      aiMeta: makeAiMeta(caps).optional(),
    })
    .describe('the persisted multi-composition document (round-trip)');
}

export type Composition = z.infer<ReturnType<typeof makeComposition>>;
export type SceneDocument = z.infer<ReturnType<typeof makeSceneDocument>>;
export type AiMeta = z.infer<ReturnType<typeof makeAiMeta>>;
export { zFrame };
