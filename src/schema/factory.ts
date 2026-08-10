import { z } from 'zod/v4';
import { DEFAULT_CAPS, type Caps } from './caps';
import { makeAiLayer, zDocumentLayer } from './layers';
import { makeAiTransform } from './properties';
import { makePanel, makePanelList } from './panels';
import { makeStyleContract } from './styleContract';
import { makeDirectorOutput, makeJob, makeCoderFragment } from './pipeline';
import { makeComposition, makeSceneDocument, makeAiMeta } from './document';
import { makePatch } from './patches';

// ONE factory assembles the full cap-parameterised bundle. Types are derived from the DEFAULT bundle
// (see caps.ts: caps are runtime bounds, not type-level distinctions), so `z.infer` stays stable
// while numeric limits vary per tier.

export function makeSchemas(caps: Caps) {
  return {
    // AI-authoring (strict, constrained-decoding targets)
    aiLayer: makeAiLayer(caps),
    aiTransform: makeAiTransform(caps),
    coderFragment: makeCoderFragment(caps),
    directorOutput: makeDirectorOutput(caps),
    job: makeJob(caps),
    patch: makePatch(caps),
    styleContract: makeStyleContract(caps),
    panel: makePanel(caps),
    panelList: makePanelList(caps),
    aiMeta: makeAiMeta(caps),
    // Document round-trip
    composition: makeComposition(caps),
    sceneDocument: makeSceneDocument(caps),
    documentLayer: zDocumentLayer,
  } as const;
}

export type Schemas = ReturnType<typeof makeSchemas>;

/** The canonical bundle types are inferred from. Numeric limits here are DEFAULT_CAPS; other tiers
 *  share these types (the shape is identical; only `.max()` bounds differ). */
export const defaultSchemas = makeSchemas(DEFAULT_CAPS);

// Derived TypeScript types — the codebase types against THESE, not hand-maintained interfaces.
export type AiLayer = z.infer<typeof defaultSchemas.aiLayer>;
export type CoderFragment = z.infer<typeof defaultSchemas.coderFragment>;
export type DirectorOutput = z.infer<typeof defaultSchemas.directorOutput>;
export type Job = z.infer<typeof defaultSchemas.job>;
export type Patch = z.infer<typeof defaultSchemas.patch>;
export type StyleContract = z.infer<typeof defaultSchemas.styleContract>;
export type Panel = z.infer<typeof defaultSchemas.panel>;
export type AiMeta = z.infer<typeof defaultSchemas.aiMeta>;
export type Composition = z.infer<typeof defaultSchemas.composition>;
export type SceneDocument = z.infer<typeof defaultSchemas.sceneDocument>;
export type DocumentLayer = z.infer<typeof defaultSchemas.documentLayer>;
