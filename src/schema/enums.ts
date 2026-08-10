// Closed vocabularies, defined as DATA so one source feeds three consumers: the Zod schema
// (constrained decoding + validation), the runtime, and the system prompt (each `*_DOC` map is
// what a prompt-builder renders as "allowed values"). Adding a value here is the ONLY place it
// changes. Everything is `as const` so the literal-tuple types flow into `z.enum(...)`.
//
// IMPORTANT: this file has NO imports from the engine/core — it is pure data, safe to run
// server-side. The layer-type lists are intentionally a SUBSET of the app's full `TrackType`
// union (src/core/types.ts): the AI introduces no new layer types, and adding one means editing
// both render dispatch ladders, so the Coder is constrained to what already draws.

/** Layer types the Coder is allowed to author, and the only `kind`s a Director panel element may
 *  take. A deliberate subset of the app's 18 `type` literals. `camera` and `audio` are FORBIDDEN:
 *  the camera path is minimal (needs 3D layers to matter) and audio needs a registered asset — both
 *  were flagged unsupported, so the AI never plans or emits them. precomp/particle/procedural/field/
 *  layout/animationItem/lottie are likewise out of the AI vocabulary for v1. */
export const AI_LAYER_TYPES = ['shape', 'text', 'group', 'image', 'video', 'cloner'] as const;
export type AiLayerType = (typeof AI_LAYER_TYPES)[number];

/** Every layer `type` literal the DOCUMENT model can hold (for round-trip). Mirrors the app's
 *  `TrackType` drawable/authorable set. Types not in AI_LAYER_TYPES round-trip via passthrough. */
export const DOCUMENT_LAYER_TYPES = [
  'shape', 'text', 'group', 'image', 'video', 'audio', 'cloner', 'camera', 'precomp',
  'particle', 'animationItem', 'fieldSampled', 'generativePattern', 'lottieIcon',
  'hbox', 'vbox', 'grid', 'layoutContainer',
] as const;
export type DocumentLayerType = (typeof DOCUMENT_LAYER_TYPES)[number];

/** Layer types NOT in the AI vocabulary — preserved losslessly (passthrough) but not field-locked. */
export const EXOTIC_LAYER_TYPES = DOCUMENT_LAYER_TYPES.filter(
  (t) => !(AI_LAYER_TYPES as readonly string[]).includes(t)
) as Exclude<DocumentLayerType, AiLayerType>[];

/** Keyframe interpolation modes (src/core/types.ts InterpolationType). */
export const INTERPOLATION_TYPES = ['linear', 'bezier', 'hold', 'spring'] as const;
export type InterpolationName = (typeof INTERPOLATION_TYPES)[number];

/** Named easing curves — the ONE closed set the Director may choose from and the Coder may name.
 *  Resolved to concrete bezier handles in ./easing.ts (the single source of the handle values). */
export const EASING_NAMES = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'spring'] as const;
export type EasingName = (typeof EASING_NAMES)[number];

/** Layer blend modes the renderer supports (src/core/types.ts BlendMode). */
export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'add'] as const;
export type BlendModeName = (typeof BLEND_MODES)[number];

/** Shape geometry kinds (src/core/types.ts ShapeGeometry union). */
export const SHAPE_TYPES = ['rectangle', 'circle', 'star', 'polygon'] as const;
export type ShapeTypeName = (typeof SHAPE_TYPES)[number];

export const TEXT_ALIGN = ['left', 'center', 'right'] as const;
export const TEXT_VALIGN = ['top', 'middle', 'bottom'] as const;
export const VERTEX_TYPES = ['corner', 'smooth', 'bezier'] as const;

/** Cloner distribution kinds (src/cloner/types.ts ClonerDistribution). */
export const DISTRIBUTION_TYPES = ['grid', 'radial', 'path', 'field'] as const;
export type DistributionName = (typeof DISTRIBUTION_TYPES)[number];

/** Cloner effector kinds (src/cloner/types.ts ClonerEffector). */
export const EFFECTOR_TYPES = ['random', 'falloff', 'step', 'time', 'target'] as const;
export type EffectorName = (typeof EFFECTOR_TYPES)[number];

export const EFFECTOR_BLEND_MODES = ['add', 'multiply', 'override'] as const;
export const EFFECTOR_WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'] as const;
export const FALLOFF_SHAPES = ['linear', 'radial', 'box', 'field'] as const;

/** Motion-preset categories (src/core/animationPresets.ts PresetCategory). */
export const PRESET_CATEGORIES = ['Position', 'Fade', 'Scale', 'Rotation', 'Combination'] as const;

/** Named motion presets the Coder may attach at layer level. This is a SCHEMA-OWNED closed
 *  vocabulary (a stable AI contract), deliberately decoupled from the engine's `ANIMATION_PRESETS`
 *  catalog ids: assembly maps each name to a concrete catalog preset or a generated keyframe track.
 *  Keeping the AI vocabulary here (not mirroring catalog ids) means the catalog can evolve without
 *  changing the model's contract. The name→catalog mapping table is pipeline code (not in this pkg). */
export const MOTION_PRESET_NAMES = [
  // entrances
  'fadeIn', 'slideIn', 'popIn',
  // exits
  'fadeOut', 'slideOut', 'scaleOut',
  // emphasis
  'emphasisPulse',
  // staggered group reveal (applies its child preset to each child of a group)
  'staggerReveal',
] as const;
export type MotionPresetName = (typeof MOTION_PRESET_NAMES)[number];

/** Semantic palette roles a style contract may name. Layers reference these; assembly resolves a
 *  role to a concrete color where the slot supports role links, else bakes a literal. The list is
 *  intentionally small and named by FUNCTION, not hue — the AI names a role, never a color. */
export const PALETTE_ROLES = [
  'background', 'surface', 'primary', 'secondary', 'accent',
  'textPrimary', 'textSecondary', 'textInverse', 'success', 'warning', 'danger', 'neutral',
] as const;
export type PaletteRole = (typeof PALETTE_ROLES)[number];

/** Panel-to-panel transition kinds (deterministic; expand into real keyframes at preset expansion). */
export const TRANSITION_TYPES = ['cut', 'crossDissolve', 'slide', 'wipe', 'push', 'zoom', 'fade'] as const;
export type TransitionName = (typeof TRANSITION_TYPES)[number];

/** Aspect/format the Director may commit to. */
export const OUTPUT_FORMATS = ['landscape', 'portrait', 'square'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/** Tone the Director commits to (informational; shapes downstream choices, not validated further). */
export const TONES = ['playful', 'serious', 'elegant', 'energetic', 'calm', 'bold', 'minimal', 'corporate'] as const;

/** Edit-path patch op kinds. Covers real editing, not just set/add. Every op addresses by ID +
 *  property path, never by index; each has a computable inverse for one-step undo. */
export const PATCH_OP_KINDS = [
  'setProperty',        // set a static value or replace a keyframe track at layerId.propertyPath
  'setKeyframes',       // replace the keyframe array of one property
  'addLayer',           // insert a fully-formed layer
  'removeLayer',        // delete a layer (inverse re-adds it)
  'reparentLayer',      // change parentId
  'reorderLayer',       // change global z-order (by explicit before/after layerId)
  'retimeLayer',        // change inPoint/outPoint (and optionally shift keyframes)
  'duplicateLayer',     // clone a layer under a new (caller-supplied) id
  'renameLayer',        // change the semantic name
  'applyPreset',        // attach a motion preset (expands to keyframes deterministically)
  'setStyleRole',       // (re)point a fill/stroke slot at a palette role
  'group',              // wrap layerIds in a new group
  'ungroup',            // dissolve a group, reparenting children
  'addPanel', 'removePanel', 'retimePanel', 'setPanelMembership',
] as const;
export type PatchOpKind = (typeof PATCH_OP_KINDS)[number];

/** Property channels the Coder may use to express a value (the four that remain after dropping the
 *  AI expression language). `static` and `keyframes` are property-level; `preset` and `cloner` are
 *  layer-level attachments (see AiLayer). Listed here for the prompt/docs. */
export const PROPERTY_CHANNELS = ['static', 'keyframes', 'preset', 'cloner'] as const;

/** One-line human descriptions per vocabulary, for the prompt-builder to render. Keep in sync with
 *  the arrays above — a value with no description is allowed but reads poorly in the prompt. */
export const VOCAB_DOC: Record<string, string> = {
  'layerType.shape': 'A vector shape (rectangle, circle, star, or polygon path).',
  'layerType.text': 'A text layer with styled spans and box layout.',
  'layerType.group': 'A transform group; children inherit its transform.',
  'layerType.image': 'A still image, referenced by asset id.',
  'layerType.video': 'A video clip, referenced by asset id.',
  'layerType.audio': 'An audio clip, referenced by asset id.',
  'layerType.cloner': 'One source layer repeated into N instances by a distribution + effector stack.',
  'layerType.camera': 'A 2.5D camera (only meaningful with 3D-enabled layers).',
  'channel.static': 'A fixed value that never animates (the cheapest case).',
  'channel.keyframes': 'A keyframe track: values at absolute frames with named easing.',
  'channel.preset': 'A named motion preset applied at the layer, expanding to real keyframes.',
  'channel.cloner': 'Parametric/index-driven variation via cloner distribution + effectors.',
};
