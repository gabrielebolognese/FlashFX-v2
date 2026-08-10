// @/schema — the standalone, framework-agnostic contract package for AI animation authoring.
//
// Zero runtime deps beyond Zod. NO React / WebGPU / IndexedDB / engine imports at runtime, so this
// runs server-side (validation) as well as in the app. It serves four jobs from one source: runtime
// validation, derived TypeScript types (import the `*` types from here, don't hand-maintain them),
// JSON Schema export for constrained decoding, and documentation (the enum/`VOCAB_DOC` data is what
// a system-prompt builder renders).
//
// Split intentionally: PARSING (Zod schemas here) is pure/structural; COERCION + default-filling and
// SEMANTIC/referential checks (references resolve, panels gapless, boundaries reconcile, no cycles,
// text fits its box, contrast) live in the separate assembly + semantic-validator stages, NOT here.

export * from './enums';
export * from './caps';
export * from './easing';
export {
  zId, zNamespacedId, zSemanticName, zFrame, zFrameDuration, zMs, zUnit, zVec2, zVec3,
  zColorLiteral, zHexColor, zColorRole, zAiColor,
} from './primitives';
export type { Id, Vec2T, Vec3T, ColorLiteral, ColorRole } from './primitives';

// Schema builders + the assembled bundle + derived types.
export { makeSchemas, defaultSchemas } from './factory';
export type {
  Schemas, AiLayer, CoderFragment, DirectorOutput, Job, Patch as PatchT, StyleContract as StyleContractT,
  Panel, AiMeta, Composition, SceneDocument, DocumentLayer,
} from './factory';

// Individual builders, for callers that need one schema at a specific tier.
export { makeAiLayer, zDocumentLayer, zMotionPresetAttachment } from './layers';
export { makeCoderFragment, makeDirectorOutput, makeJob, makeBrief, makeDirectorPanelPlan } from './pipeline';
export { makePanel, makePanelList, zTransition, zBoundaryContract, zBoundaryState } from './panels';
export { makeStyleContract, zPaletteEntry, zStaggerDoctrine } from './styleContract';
export { makeComposition, makeSceneDocument, makeAiMeta } from './document';
export { makePatch, zPatchOp } from './patches';
export { PRESET_PARAMS } from './presetParams';
export type { MotionPresetAttachment } from './presetParams';
export { makeClonerConfig, zClonerDistribution, zClonerEffector } from './cloner';
export {
  zKeyframeDoc, zAnimatableNumberDoc, zAnimatableVec2Doc, zTransformDoc,
  makeAiNumberProp, makeAiVec2Prop, makeAiTransform,
} from './properties';

// JSON Schema export for constrained decoding.
export { toJsonSchema, assertDecodable, exportDecodingSchemas, findRefs } from './jsonSchema';
