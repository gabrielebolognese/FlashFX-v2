// Agent-mode feature manifest: a curated, machine-readable list of what FlashFX can do and HOW an
// automated agent (or a human following a script) does it. It is the single source of truth for
// both the static endpoint `public/agent/features.json` (written at build time by
// scripts/gen-agent-manifest.mjs) and the in-app `window.__ffxAgent` runtime (src/agent/runtime.ts),
// whose `run()` dispatches ONLY to the actions declared here.
//
// Pure data: no React / DOM / store VALUE imports (so the generator can bundle it in Node). The
// store imports below are `import type` only - erased at build time - and exist so `tsc` PROVES
// every `editor` / `history` method named here is a real function member of the live store. The
// verify:agent-manifest harness additionally checks parameter names/order against the store's
// declared signatures and that each method is implemented in the store body.
//
// Rules for editing: only list features that ship (reachable from src/main.tsx). Mark anything that
// needs WebGPU / a real browser to prove as 'browser-gated', anything incomplete as 'partial'.

import type { useEditorStore } from '../store/editor';
import type { useHistoryStore } from '../store/history';

/** Bumped when the manifest SHAPE changes (not when features are added). */
export const AGENT_MANIFEST_SCHEMA_VERSION = 1;

type FnKeys<S> = { [K in keyof S]-?: S[K] extends (...args: never[]) => unknown ? K : never }[keyof S] & string;

/** Every function member of the editor store (compile-time checked). */
export type EditorMethod = FnKeys<ReturnType<typeof useEditorStore.getState>>;
/** Every function member of the history store (compile-time checked). */
export type HistoryMethod = FnKeys<ReturnType<typeof useHistoryStore.getState>>;
/** Composite helpers implemented in src/agent/runtime.ts on top of real store actions. */
export type AgentHelperMethod =
  | 'applyTextAnimatorPreset'
  | 'applyTextDecode'
  | 'setTextContent'
  | 'setExpression'
  | 'removeExpression';

export type FeatureStatus = 'shipped' | 'browser-gated' | 'partial';

export type FeatureArea =
  | 'composition'
  | 'layers'
  | 'text'
  | 'shapes'
  | 'keyframes'
  | 'expressions'
  | 'cloner'
  | 'particles'
  | 'physics'
  | 'masks'
  | 'effects'
  | 'adjustment'
  | 'precomp'
  | 'camera-2.5d'
  | 'captions'
  | 'media'
  | 'export'
  | 'templates';

/** Live value lists the agent can enumerate (see src/agent/catalogs.ts). */
export type CatalogId =
  | 'animationPresets'
  | 'textAnimatorPresets'
  | 'particlePresets'
  | 'animationTemplates'
  | 'animationItems'
  | 'proceduralPresets'
  | 'vfxElements'
  | 'easings';

export interface AgentParam {
  name: string;
  /** TypeScript-ish type of the argument as the action receives it. */
  type: string;
  optional?: boolean;
  /** Closed set of allowed string values. */
  values?: readonly string[];
  /** Allowed values come from a live catalog. */
  catalog?: CatalogId;
  description?: string;
}

interface ActionBase {
  /** Stable id used by `window.__ffxAgent.run(id, args)`, e.g. "editor.addText". */
  id: string;
  description: string;
  params: readonly AgentParam[];
  /** True when the action pushes a normal history command (Ctrl+Z reverts it). */
  undoable: boolean;
  /** What run() returns in `result` (besides the generic activeLayerId). */
  returns?: string;
}

export type AgentActionSpec =
  | (ActionBase & { store: 'editor'; method: EditorMethod })
  | (ActionBase & { store: 'history'; method: HistoryMethod })
  | (ActionBase & { store: 'agent'; method: AgentHelperMethod });

export interface AgentFeature {
  id: string;
  area: FeatureArea;
  name: string;
  description: string;
  /** How a human does it in the UI (menu / panel path). */
  ui: string;
  /** Action ids (from AGENT_ACTIONS) that implement it. Empty = UI-only. */
  actions: readonly string[];
  status: FeatureStatus;
  notes?: string;
}

// ---------------------------------------------------------------------------------------------
// Shared value lists (mirrors of the core string unions; the harness re-checks the important ones)
// ---------------------------------------------------------------------------------------------

const SHAPE_TYPES = ['rectangle', 'circle', 'star', 'polygon'] as const;
const INTERPOLATION_TYPES = ['linear', 'bezier', 'hold', 'spring'] as const;
const SPLIT_MODES = ['character', 'word', 'line', 'paragraph'] as const;
const MODIFIER_TYPES = ['trim', 'offset', 'roughen', 'puckerBloat'] as const;
const BOOLEAN_OPS = ['union', 'intersection', 'difference', 'xor'] as const;
const MASK_TYPES = ['rectangle', 'ellipse', 'star', 'polygon'] as const;
const MASK_REVEALS = ['irisIn', 'wipeRight', 'wipeLeft', 'wipeDown', 'wipeUp'] as const;
const TRACK_MATTES = ['alpha', 'alphaInv', 'luma', 'lumaInv'] as const;
const EFFECTOR_TYPES = ['random', 'falloff', 'step', 'time', 'target'] as const;
const PHYSICS_ROLES = ['kinematic', 'dynamic', 'static', 'ghost'] as const;
const MOTION_PRINCIPLES = ['anticipation', 'follow-through', 'squash-stretch', 'stagger'] as const;
const LAYER_FX = ['shadow', 'glow', 'blur'] as const;

const KF_TARGETS: AgentParam = {
  name: 'targets',
  type: 'Array<{ propertyPath: string; frame: number }>',
  description: 'Keyframes to act on, addressed by property path + frame.',
};
const LAYER_ID: AgentParam = { name: 'layerId', type: 'string', description: 'Target layer id (see getState().layers).' };

// ---------------------------------------------------------------------------------------------
// Actions (the run() whitelist)
// ---------------------------------------------------------------------------------------------

export const AGENT_ACTIONS: readonly AgentActionSpec[] = [
  // ----- history -----
  { id: 'history.undo', store: 'history', method: 'undo', params: [], undoable: false, description: 'Undo the last undoable command.' },
  { id: 'history.redo', store: 'history', method: 'redo', params: [], undoable: false, description: 'Redo the last undone command.' },

  // ----- composition / playback -----
  { id: 'editor.setCompositionSetting', store: 'editor', method: 'setCompositionSetting', undoable: true,
    description: 'Change a numeric composition setting.',
    params: [{ name: 'key', type: 'string', values: ['width', 'height', 'frameRate', 'durationFrames', 'minimumDurationFrames'] }, { name: 'value', type: 'number' }] },
  { id: 'editor.setCompositionSize', store: 'editor', method: 'setCompositionSize', undoable: true,
    description: 'Resize the frame (e.g. 1920x1080) and reflow top-level layers by their constraints.',
    params: [{ name: 'width', type: 'number' }, { name: 'height', type: 'number' }] },
  { id: 'editor.setCurrentFrame', store: 'editor', method: 'setCurrentFrame', undoable: false,
    description: 'Move the playhead.', params: [{ name: 'frame', type: 'number' }] },
  { id: 'editor.setPlaying', store: 'editor', method: 'setPlaying', undoable: false,
    description: 'Start or stop preview playback.', params: [{ name: 'playing', type: 'boolean' }] },
  { id: 'editor.addBackgroundLayer', store: 'editor', method: 'addBackgroundLayer', undoable: true, params: [],
    description: 'Add a solid/gradient background layer to the composition background stack.' },
  { id: 'editor.updateBackgroundLayer', store: 'editor', method: 'updateBackgroundLayer', undoable: true,
    description: 'Patch a background layer (see BackgroundLayer in src/core/types.ts).',
    params: [{ name: 'id', type: 'string' }, { name: 'updates', type: 'Partial<BackgroundLayer>' }] },
  { id: 'editor.addMarker', store: 'editor', method: 'addMarker', undoable: true,
    description: 'Add a timeline marker.',
    params: [{ name: 'frame', type: 'number' }, { name: 'opts', type: '{ name?: string; color?: string; endFrame?: number }', optional: true }] },
  { id: 'editor.createScene', store: 'editor', method: 'createScene', undoable: true,
    description: 'Create a new scene (top-level composition).', params: [{ name: 'name', type: 'string', optional: true }] },
  { id: 'editor.switchScene', store: 'editor', method: 'switchScene', undoable: false,
    description: 'Switch the active scene.', params: [{ name: 'id', type: 'string' }] },

  // ----- generic layer ops -----
  { id: 'editor.selectLayer', store: 'editor', method: 'selectLayer', undoable: false,
    description: 'Select a layer (null clears).',
    params: [{ name: 'id', type: 'string | null' }, { name: 'additive', type: 'boolean', optional: true }, { name: 'source', type: 'string', optional: true, values: ['canvas', 'timeline'] }] },
  { id: 'editor.selectAllLayers', store: 'editor', method: 'selectAllLayers', undoable: false, params: [], description: 'Select every layer.' },
  { id: 'editor.deselectAll', store: 'editor', method: 'deselectAll', undoable: false, params: [], description: 'Clear the selection.' },
  { id: 'editor.updateLayerProperty', store: 'editor', method: 'updateLayerProperty', undoable: true,
    description: 'Set any layer field by dot-path (arrays by index). For an animatable property set "<path>.defaultValue" (its un-keyframed value). Colours are RGBA 0..1. Examples: "transform.position.defaultValue" -> [960,540]; "transform.opacity.defaultValue" -> 0.5; "content.spans.0.style.fontSize" -> 120; "content.spans.0.style.color" -> [1,0.8,0.2,1]; "shape.fillColor" -> [1,0,0,1]; "blendMode" -> "screen".',
    params: [LAYER_ID, { name: 'path', type: 'string' }, { name: 'value', type: 'unknown' }] },
  { id: 'editor.renameLayer', store: 'editor', method: 'renameLayer', undoable: true,
    description: 'Rename a layer.', params: [{ name: 'id', type: 'string' }, { name: 'name', type: 'string' }] },
  { id: 'editor.removeLayer', store: 'editor', method: 'removeLayer', undoable: true,
    description: 'Delete one layer.', params: [{ name: 'id', type: 'string' }] },
  { id: 'editor.removeLayers', store: 'editor', method: 'removeLayers', undoable: true,
    description: 'Delete several layers in one undo step.', params: [{ name: 'ids', type: 'string[]' }] },
  { id: 'editor.duplicateSelection', store: 'editor', method: 'duplicateSelection', undoable: true, params: [],
    description: 'Duplicate the selected layers.' },
  { id: 'editor.createGroup', store: 'editor', method: 'createGroup', undoable: true, params: [],
    description: 'Group the selected layers (needs 2+ selected).' },
  { id: 'editor.ungroupSelection', store: 'editor', method: 'ungroupSelection', undoable: true, params: [],
    description: 'Ungroup the selected group.' },
  { id: 'editor.setLayerParent', store: 'editor', method: 'setLayerParent', undoable: true,
    description: 'Parent a layer to another (null unparents); the child inherits the parent transform.',
    params: [{ name: 'childId', type: 'string' }, { name: 'parentId', type: 'string | null' }] },
  { id: 'editor.setLayerAnchor', store: 'editor', method: 'setLayerAnchor', undoable: true,
    description: 'Move the pivot (anchor point) without moving the layer on screen.',
    params: [{ name: 'id', type: 'string' }, { name: 'anchor', type: '[number, number]' }, { name: 'frame', type: 'number' }] },
  { id: 'editor.reorderLayers', store: 'editor', method: 'reorderLayers', undoable: true,
    description: 'Move layers to a stacking index.',
    params: [{ name: 'sourceIds', type: 'string[]' }, { name: 'targetIndex', type: 'number' }] },
  { id: 'editor.moveClipInTime', store: 'editor', method: 'moveClipInTime', undoable: true,
    description: 'Slide a clip so it starts at a new frame.',
    params: [LAYER_ID, { name: 'newInPoint', type: 'number' }] },
  { id: 'editor.trimSplit', store: 'editor', method: 'trimSplit', undoable: true,
    description: 'Split a clip at the playhead.', params: [{ name: 'layerId', type: 'string', optional: true }] },

  // ----- text -----
  { id: 'editor.addText', store: 'editor', method: 'addText', undoable: true, returns: 'new layer id (activeLayerId)',
    description: 'Add a centred text layer.', params: [{ name: 'content', type: 'string', optional: true }] },
  { id: 'editor.createQuickText', store: 'editor', method: 'createQuickText', undoable: true, returns: 'new layer id',
    description: 'Add committed point text at a position (comp px).',
    params: [{ name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'text', type: 'string' }] },
  { id: 'agent.setTextContent', store: 'agent', method: 'setTextContent', undoable: true,
    description: 'Replace the text of a text layer (keeps the first span style). Undoable via updateLayerProperty.',
    params: [LAYER_ID, { name: 'text', type: 'string' }] },
  { id: 'agent.applyTextAnimatorPreset', store: 'agent', method: 'applyTextAnimatorPreset', undoable: true,
    description: 'Add a per-character/word/line text animator (range selector) preset, keyframed over [startFrame, startFrame+durationFrames]. Undoable via updateLayerProperty("animators").',
    params: [LAYER_ID, { name: 'presetId', type: 'string', catalog: 'textAnimatorPresets' }, { name: 'startFrame', type: 'number', optional: true }, { name: 'durationFrames', type: 'number', optional: true }, { name: 'replace', type: 'boolean', optional: true, description: 'true = replace existing animators instead of appending.' }] },
  { id: 'agent.applyTextDecode', store: 'agent', method: 'applyTextDecode', undoable: true,
    description: 'Scramble/decode reveal (hacker text) over [startFrame, startFrame+durationFrames].',
    params: [LAYER_ID, { name: 'startFrame', type: 'number', optional: true }, { name: 'durationFrames', type: 'number', optional: true }] },
  { id: 'editor.explodeTextLayer', store: 'editor', method: 'explodeTextLayer', undoable: true,
    description: 'Split a text layer into separate layers per character/word/line with a time stagger.',
    params: [LAYER_ID, { name: 'splitMode', type: 'string', values: SPLIT_MODES }, { name: 'staggerFrames', type: 'number' }] },
  { id: 'editor.outlineTextLayer', store: 'editor', method: 'outlineTextLayer', undoable: true,
    description: 'Convert text to editable vector paths.', params: [LAYER_ID] },

  // ----- shapes -----
  { id: 'editor.addRectangle', store: 'editor', method: 'addRectangle', undoable: true, params: [], returns: 'new layer id (activeLayerId)', description: 'Add a rectangle.' },
  { id: 'editor.addCircle', store: 'editor', method: 'addCircle', undoable: true, params: [], returns: 'new layer id (activeLayerId)', description: 'Add an ellipse.' },
  { id: 'editor.addStar', store: 'editor', method: 'addStar', undoable: true, params: [], returns: 'new layer id (activeLayerId)', description: 'Add a star.' },
  { id: 'editor.addPolygon', store: 'editor', method: 'addPolygon', undoable: true, params: [], returns: 'new layer id (activeLayerId)', description: 'Add a polygon.' },
  { id: 'editor.addShapeWithDimensions', store: 'editor', method: 'addShapeWithDimensions', undoable: true, returns: 'new layer id (activeLayerId)',
    description: 'Add a shape with an explicit position and size (comp px).',
    params: [{ name: 'shapeType', type: 'string', values: SHAPE_TYPES }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }] },
  { id: 'editor.addShapeModifier', store: 'editor', method: 'addShapeModifier', undoable: true,
    description: 'Add a path modifier (Trim Paths for line draw-on, Offset, Roughen, Pucker & Bloat). Edit params with updateLayerProperty/addKeyframe on "modifiers.<i>.<param>".',
    params: [LAYER_ID, { name: 'type', type: 'string', values: MODIFIER_TYPES }] },
  { id: 'editor.toggleShapeRepeater', store: 'editor', method: 'toggleShapeRepeater', undoable: true,
    description: 'Turn the in-shape Repeater (radial arrays / spirals) on or off.', params: [LAYER_ID] },
  { id: 'editor.setShapeDash', store: 'editor', method: 'setShapeDash', undoable: true,
    description: 'Set a dashed stroke pattern (empty array = solid).', params: [LAYER_ID, { name: 'dashArray', type: 'number[]' }] },
  { id: 'editor.convertShapeToPath', store: 'editor', method: 'convertShapeToPath', undoable: true,
    description: 'Convert a parametric shape to an editable path.', params: [LAYER_ID] },
  { id: 'editor.booleanSelectedShapes', store: 'editor', method: 'booleanSelectedShapes', undoable: true,
    description: 'Boolean the selected shapes into one path.', params: [{ name: 'op', type: 'string', values: BOOLEAN_OPS }] },

  // ----- keyframes / easing / motion -----
  { id: 'editor.addKeyframe', store: 'editor', method: 'addKeyframe', undoable: true,
    description: 'Set a keyframe. Paths: "transform.position" [x,y], "transform.scale" [sx,sy] (1 = 100%), "transform.rotation" deg, "transform.opacity" 0..1, "animOverrides.fontSize", "animOverrides.letterSpacing", "shape.width", "modifiers.0.end", etc.',
    params: [LAYER_ID, { name: 'propertyPath', type: 'string' }, { name: 'frame', type: 'number' }, { name: 'value', type: 'number | [number, number]' }] },
  { id: 'editor.deleteKeyframes', store: 'editor', method: 'deleteKeyframes', undoable: true,
    description: 'Delete keyframes.', params: [LAYER_ID, KF_TARGETS] },
  { id: 'editor.setKeyframeInterpolation', store: 'editor', method: 'setKeyframeInterpolation', undoable: true,
    description: 'Set interpolation (and optional bezier handles) on keyframes.',
    params: [LAYER_ID, KF_TARGETS, { name: 'interpolation', type: 'string', values: INTERPOLATION_TYPES }, { name: 'handleIn', type: '[number, number]', optional: true }, { name: 'handleOut', type: '[number, number]', optional: true }] },
  { id: 'editor.setKeyframeEasing', store: 'editor', method: 'setKeyframeEasing', undoable: true,
    description: 'Apply a named ease (Penner / back / elastic / bounce) to the outgoing segment of each keyframe; null clears.',
    params: [LAYER_ID, KF_TARGETS, { name: 'easing', type: 'string | null', catalog: 'easings' }] },
  { id: 'editor.addFade', store: 'editor', method: 'addFade', undoable: true,
    description: 'Add a fade in/out on a property (usually "transform.opacity").',
    params: [LAYER_ID, { name: 'propertyPath', type: 'string' }, { name: 'kind', type: 'string', values: ['in', 'out'] }, { name: 'durationFrames', type: 'number', optional: true }] },
  { id: 'editor.smoothKeyframes', store: 'editor', method: 'smoothKeyframes', undoable: true,
    description: 'Smoother assistant over the selected keyframes.', params: [LAYER_ID, KF_TARGETS] },
  { id: 'editor.wiggleKeyframes', store: 'editor', method: 'wiggleKeyframes', undoable: true,
    description: 'Wiggler: seeded organic tremble on interior keyframes.',
    params: [LAYER_ID, KF_TARGETS, { name: 'amplitude', type: 'number' }, { name: 'seed', type: 'number' }] },
  { id: 'editor.applyAnimationPreset', store: 'editor', method: 'applyAnimationPreset', undoable: true,
    description: 'Apply a one-click animation preset (slide/fade/scale/rotate/combos) at the playhead.',
    params: [LAYER_ID, { name: 'presetId', type: 'string', catalog: 'animationPresets' }] },
  { id: 'editor.applyAnimationPresetBatch', store: 'editor', method: 'applyAnimationPresetBatch', undoable: true,
    description: 'Apply a preset to many layers with a duration, at the clip start or the playhead.',
    params: [{ name: 'layerIds', type: 'string[]' }, { name: 'presetId', type: 'string', catalog: 'animationPresets' }, { name: 'durationSeconds', type: 'number' }, { name: 'atStart', type: 'boolean' }] },
  { id: 'editor.applyMotionPrinciple', store: 'editor', method: 'applyMotionPrinciple', undoable: true,
    description: 'Rewrite keyframes with a motion-design principle rig.',
    params: [{ name: 'layerIds', type: 'string[]' }, { name: 'principle', type: 'string', values: MOTION_PRINCIPLES }, { name: 'opts', type: '{ amount?: number; ease?: string; gapFrames?: number }', optional: true }] },
  { id: 'editor.applySecondaryMotion', store: 'editor', method: 'applySecondaryMotion', undoable: true,
    description: 'Make a layer trail another with spring-damped lag (follow-through).',
    params: [{ name: 'childId', type: 'string' }, { name: 'parentId', type: 'string' }, { name: 'opts', type: '{ lag?: number; bounce?: number }', optional: true }] },
  { id: 'editor.addMotionPath', store: 'editor', method: 'addMotionPath', undoable: true,
    description: 'Attach an editable motion path to a layer.', params: [LAYER_ID] },

  // ----- expressions -----
  { id: 'agent.setExpression', store: 'agent', method: 'setExpression', undoable: true,
    description: 'Attach a JavaScript expression to a property, keyed by its display name ("Position", "Rotation", "Scale", "Opacity", "Anchor Point", "Width", ...). Wrapped in a history command.',
    params: [LAYER_ID, { name: 'propertyName', type: 'string' }, { name: 'code', type: 'string', description: 'e.g. "wiggle(2, 30)" or "time * 90".' }] },
  { id: 'agent.removeExpression', store: 'agent', method: 'removeExpression', undoable: true,
    description: 'Remove an expression from a property.', params: [LAYER_ID, { name: 'propertyName', type: 'string' }] },

  // ----- cloner -----
  { id: 'editor.addCloner', store: 'editor', method: 'addCloner', undoable: true, params: [], returns: 'new layer id (activeLayerId)',
    description: 'Add a Cloner (clones the selected eligible layer, or a placeholder circle).' },
  { id: 'editor.createClonerFromSelection', store: 'editor', method: 'createClonerFromSelection', undoable: true, params: [], returns: 'new layer id (activeLayerId)',
    description: 'Wrap the selected layer as a Cloner source.' },
  { id: 'editor.addClonerEffector', store: 'editor', method: 'addClonerEffector', undoable: true,
    description: 'Append an effector to a cloner stack.', params: [LAYER_ID, { name: 'type', type: 'string', values: EFFECTOR_TYPES }] },
  { id: 'editor.removeClonerEffector', store: 'editor', method: 'removeClonerEffector', undoable: true,
    description: 'Remove the effector at an index.', params: [LAYER_ID, { name: 'index', type: 'number' }] },

  // ----- particles / procedural / patterns -----
  { id: 'editor.addParticleLayer', store: 'editor', method: 'addParticleLayer', undoable: true, params: [], returns: 'new layer id (activeLayerId)',
    description: 'Add a particle emitter layer.' },
  { id: 'editor.addProceduralBinding', store: 'editor', method: 'addProceduralBinding', undoable: true,
    description: 'Attach a procedural motion preset (oscillate, orbit, noise drift...) to a layer.',
    params: [LAYER_ID, { name: 'presetName', type: 'string', catalog: 'proceduralPresets' }] },
  { id: 'editor.addGenerativePatternLayer', store: 'editor', method: 'addGenerativePatternLayer', undoable: true, returns: 'new layer id (activeLayerId)',
    description: 'Add an animated generative pattern layer.', params: [{ name: 'configJSON', type: 'string', optional: true }] },
  { id: 'editor.addVfxElement', store: 'editor', method: 'addVfxElement', undoable: true, returns: 'new layer id (activeLayerId)',
    description: 'Add a practical VFX element (light leak / film burn / atmosphere) with its sweep.',
    params: [{ name: 'elementId', type: 'string', catalog: 'vfxElements' }] },

  // ----- physics -----
  { id: 'editor.addPhysicsBinding', store: 'editor', method: 'addPhysicsBinding', undoable: true,
    description: 'Give a layer a 2D rigid-body role.', params: [LAYER_ID, { name: 'role', type: 'string', values: PHYSICS_ROLES }] },
  { id: 'editor.updatePhysicsWorld', store: 'editor', method: 'updatePhysicsWorld', undoable: true,
    description: 'Patch world settings (gravity, etc.).', params: [{ name: 'updates', type: 'Partial<PhysicsWorldDef>' }] },
  { id: 'editor.bakePhysics', store: 'editor', method: 'bakePhysics', undoable: false, returns: 'Promise<void>',
    description: 'Simulate and bake physics to the timeline.', params: [] },

  // ----- masks / mattes -----
  { id: 'editor.addMask', store: 'editor', method: 'addMask', undoable: true,
    description: 'Add a parametric mask to a layer (new mask is last in layer.masks).',
    params: [LAYER_ID, { name: 'type', type: 'string', values: MASK_TYPES }] },
  { id: 'editor.removeMask', store: 'editor', method: 'removeMask', undoable: true,
    description: 'Remove a mask.', params: [LAYER_ID, { name: 'maskId', type: 'string' }] },
  { id: 'editor.updateMaskProperty', store: 'editor', method: 'updateMaskProperty', undoable: true,
    description: 'Set a mask field by dot-path (e.g. "feather.defaultValue", "mode", "inverted").',
    params: [LAYER_ID, { name: 'maskId', type: 'string' }, { name: 'path', type: 'string' }, { name: 'value', type: 'unknown' }] },
  { id: 'editor.addMaskKeyframe', store: 'editor', method: 'addMaskKeyframe', undoable: true,
    description: 'Keyframe a mask property.',
    params: [LAYER_ID, { name: 'maskId', type: 'string' }, { name: 'propertyPath', type: 'string' }, { name: 'frame', type: 'number' }, { name: 'value', type: 'number | [number, number]' }] },
  { id: 'editor.applyMaskReveal', store: 'editor', method: 'applyMaskReveal', undoable: true,
    description: 'Keyframe an iris / wipe reveal of the layer through a mask.',
    params: [LAYER_ID, { name: 'maskId', type: 'string' }, { name: 'kind', type: 'string', values: MASK_REVEALS }, { name: 'startFrame', type: 'number' }, { name: 'durationFrames', type: 'number' }] },
  { id: 'editor.setTrackMatte', store: 'editor', method: 'setTrackMatte', undoable: true,
    description: 'Matte a layer by the layer directly above it (undefined clears).',
    params: [LAYER_ID, { name: 'mode', type: 'string | undefined', values: TRACK_MATTES }] },

  // ----- effects / adjustment -----
  { id: 'editor.enableLayerEffect', store: 'editor', method: 'enableLayerEffect', undoable: true,
    description: 'Turn on the layer drop shadow, glow or blur (tune via updateLayerProperty on "shadow" / "glow" / "blur").',
    params: [LAYER_ID, { name: 'kind', type: 'string', values: LAYER_FX }] },
  { id: 'editor.setLayerEffectParam', store: 'editor', method: 'setLayerEffectParam', undoable: true,
    description: 'Set one parameter of an effect-stack effect (adds the effect if missing). Effect type ids/param indices: src/core/effects.',
    params: [LAYER_ID, { name: 'type', type: 'number' }, { name: 'paramIndex', type: 'number' }, { name: 'value', type: 'number' }, { name: 'defaults', type: 'number[]', optional: true }] },
  { id: 'editor.toggleLayerEffect', store: 'editor', method: 'toggleLayerEffect', undoable: true,
    description: 'Enable/disable an effect-stack effect.', params: [LAYER_ID, { name: 'type', type: 'number' }] },
  { id: 'editor.removeLayerEffect', store: 'editor', method: 'removeLayerEffect', undoable: true,
    description: 'Remove an effect-stack effect.', params: [LAYER_ID, { name: 'type', type: 'number' }] },
  { id: 'editor.addAdjustmentLayer', store: 'editor', method: 'addAdjustmentLayer', undoable: true, params: [], returns: 'new layer id (activeLayerId)',
    description: 'Add an adjustment layer (its effects apply to everything below it).' },
  { id: 'editor.addBeamLayer', store: 'editor', method: 'addBeamLayer', undoable: true, params: [], returns: 'new layer id (activeLayerId)',
    description: 'Add a light beam / laser layer.' },

  // ----- precomp -----
  { id: 'editor.precomposeSelection', store: 'editor', method: 'precomposeSelection', undoable: true, params: [],
    description: 'Wrap the selected layers into a new sub-composition (keeps world transforms).' },
  { id: 'editor.enterPrecomp', store: 'editor', method: 'enterPrecomp', undoable: false,
    description: 'Open a precomposition for editing.', params: [{ name: 'compositionId', type: 'string' }] },
  { id: 'editor.exitPrecomp', store: 'editor', method: 'exitPrecomp', undoable: false, params: [],
    description: 'Go up one level in the composition breadcrumb.' },

  // ----- 2.5D camera -----
  { id: 'editor.addCameraLayer', store: 'editor', method: 'addCameraLayer', undoable: true, params: [], returns: 'new layer id (activeLayerId)',
    description: 'Add a 2.5D camera.' },
  { id: 'editor.toggleLayer3D', store: 'editor', method: 'toggleLayer3D', undoable: true,
    description: 'Make a layer a 3D card (seen by the camera) or flat again.', params: [LAYER_ID] },

  // ----- captions -----
  { id: 'editor.addCaptionClips', store: 'editor', method: 'addCaptionClips', undoable: true,
    description: 'Commit caption text layers from a transcript you already have (seconds).',
    params: [{ name: 'segments', type: 'Array<{ text: string; start: number; end: number }>' }, { name: 'options', type: 'CaptionOptions (src/core/captions.ts)' }, { name: 'clipStartFrame', type: 'number' }] },

  // ----- media -----
  { id: 'editor.addImageFromAsset', store: 'editor', method: 'addImageFromAsset', undoable: true,
    description: 'Place an already-imported image asset.', params: [{ name: 'assetId', type: 'string' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }] },
  { id: 'editor.addVideoFromAsset', store: 'editor', method: 'addVideoFromAsset', undoable: true,
    description: 'Place an already-imported video asset.',
    params: [{ name: 'assetId', type: 'string' }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'playbackMode', type: 'string', optional: true }] },
  { id: 'editor.fitLayerToCanvas', store: 'editor', method: 'fitLayerToCanvas', undoable: true,
    description: 'Scale an image/video layer to fit the canvas.', params: [LAYER_ID] },

  // ----- templates -----
  { id: 'editor.insertAnimationTemplate', store: 'editor', method: 'insertAnimationTemplate', undoable: true,
    description: 'Insert a pre-built animated template (title, lower third, chart, scene...) at the playhead.',
    params: [{ name: 'id', type: 'string', catalog: 'animationTemplates' }, { name: 'center', type: '[number, number]', optional: true }] },
  { id: 'editor.addAnimationItem', store: 'editor', method: 'addAnimationItem', undoable: true, returns: 'new layer id (activeLayerId)',
    description: 'Add an animation item (ready-made animated element).', params: [{ name: 'presetName', type: 'string', catalog: 'animationItems' }] },
];

// ---------------------------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------------------------

export const AGENT_FEATURES: readonly AgentFeature[] = [
  // composition
  { id: 'composition.settings', area: 'composition', name: 'Composition size, fps and duration',
    description: 'Set the frame size (e.g. 1920x1080 or 1080x1920), frame rate and minimum duration.',
    ui: 'File > Project Settings... (or the composition settings in the Inspector with nothing selected)',
    actions: ['editor.setCompositionSize', 'editor.setCompositionSetting'], status: 'shipped' },
  { id: 'composition.background', area: 'composition', name: 'Background layers',
    description: 'Solid / gradient background stack behind every layer.', ui: 'Inspector with nothing selected > Background',
    actions: ['editor.addBackgroundLayer', 'editor.updateBackgroundLayer'], status: 'shipped' },
  { id: 'composition.playback', area: 'composition', name: 'Playhead and preview',
    description: 'Scrub, play and pause the WebGPU preview.', ui: 'Timeline playhead; Space to play/pause',
    actions: ['editor.setCurrentFrame', 'editor.setPlaying'], status: 'browser-gated', notes: 'Preview renders through WebGPU.' },
  { id: 'composition.markers', area: 'composition', name: 'Timeline markers',
    description: 'Named markers / ranges on the timeline.', ui: 'Right-click the timeline ruler > Add Marker',
    actions: ['editor.addMarker'], status: 'shipped' },
  { id: 'composition.scenes', area: 'composition', name: 'Scenes',
    description: 'Multiple top-level scenes in one project.', ui: 'Toolbar > Scene > New Scene / scene switcher',
    actions: ['editor.createScene', 'editor.switchScene'], status: 'shipped' },
  { id: 'composition.undo', area: 'composition', name: 'Undo / redo',
    description: 'Every editing action is one history command.', ui: 'Edit > Undo (Ctrl+Z) / Redo (Ctrl+Shift+Z)',
    actions: ['history.undo', 'history.redo'], status: 'shipped' },

  // layers
  { id: 'layers.edit', area: 'layers', name: 'Select, rename, delete, duplicate, reorder',
    description: 'Core layer management and any property edit by dot-path.',
    ui: 'Canvas / timeline selection; Edit menu; Object > Bring to Front / Send to Back; Inspector fields',
    actions: ['editor.selectLayer', 'editor.selectAllLayers', 'editor.deselectAll', 'editor.updateLayerProperty', 'editor.renameLayer', 'editor.removeLayer', 'editor.removeLayers', 'editor.duplicateSelection', 'editor.reorderLayers'],
    status: 'shipped' },
  { id: 'layers.groups-parenting', area: 'layers', name: 'Groups, parenting and anchor point',
    description: 'Group layers, parent one layer to another, move the pivot.',
    ui: 'Object > Group (Ctrl+G) / Ungroup; Inspector > Anchor tab (pivot). Parenting has no UI control yet: agent-only via setLayerParent',
    actions: ['editor.createGroup', 'editor.ungroupSelection', 'editor.setLayerParent', 'editor.setLayerAnchor'], status: 'shipped' },
  { id: 'layers.timing', area: 'layers', name: 'Clip timing',
    description: 'Slide and split clips on the timeline.', ui: 'Drag clips in the timeline; right-click a clip > Split at Playhead (Ctrl+Shift+S)',
    actions: ['editor.moveClipInTime', 'editor.trimSplit'], status: 'shipped' },

  // text
  { id: 'text.add', area: 'text', name: 'Text layers',
    description: 'Point or paragraph text with per-span font, weight, size, colour, stroke, letter spacing, line height.',
    ui: 'Canvas toolbar > Text (T), click the canvas and type; style in Inspector > Text',
    actions: ['editor.addText', 'editor.createQuickText', 'agent.setTextContent', 'editor.updateLayerProperty'], status: 'shipped' },
  { id: 'text.animators', area: 'text', name: 'Text animators (range selectors)',
    description: 'After-Effects-style per-character / word / line animators driven by a range selector: type-on, fade, pop, cascade, slide, rise, blur, tumble.',
    ui: 'Select a text layer > Inspector (properties) > Animators section > pick a preset (edit selector shape / offset there)',
    actions: ['agent.applyTextAnimatorPreset'], status: 'shipped', notes: 'Per-character animators target single-line text. Defaults match the UI: start frame 0, 30 frames.' },
  { id: 'text.decode', area: 'text', name: 'Text decode / scramble reveal',
    description: 'Characters flicker through random glyphs before resolving (hacker text).',
    ui: 'Select a text layer > Inspector > Animators section > Decode', actions: ['agent.applyTextDecode'], status: 'shipped' },
  { id: 'text.explode', area: 'text', name: 'Explode text into layers',
    description: 'Split text into separate per-character / word / line layers with a stagger, for hand animation.',
    ui: 'Select a text layer > Inspector > Motion Control tab > Split Mode + Stagger Delay > Explode', actions: ['editor.explodeTextLayer'], status: 'shipped' },
  { id: 'text.outline', area: 'text', name: 'Outline text to paths',
    description: 'Convert text into editable vector shapes.', ui: 'Path > Outline Text (Ctrl+Shift+O)',
    actions: ['editor.outlineTextLayer'], status: 'shipped' },
  { id: 'text.animated-properties', area: 'text', name: 'Animated font size / tracking / line height',
    description: 'Keyframe text size, letter spacing, line height and stroke width.',
    ui: 'Inspector > Text > stopwatch next to the field',
    actions: ['editor.addKeyframe'], status: 'shipped', notes: 'Paths: animOverrides.fontSize, animOverrides.letterSpacing, animOverrides.lineHeight, animOverrides.strokeWidth.' },
  { id: 'text.path', area: 'text', name: 'Text on a path',
    description: 'Flow text along a path layer.', ui: 'Select a text layer > Inspector > Animators section > Text Path',
    actions: ['editor.updateLayerProperty'], status: 'shipped', notes: 'Field "textPath" (TextPathBinding in src/core/types.ts).' },

  // shapes
  { id: 'shapes.add', area: 'shapes', name: 'Shapes',
    description: 'Rectangles (rounded), ellipses, stars, polygons with fill, stroke, gradients and materials.',
    ui: 'Canvas toolbar > Rectangle (R) / Ellipse (E) / Star / Polygon, drag on canvas',
    actions: ['editor.addRectangle', 'editor.addCircle', 'editor.addStar', 'editor.addPolygon', 'editor.addShapeWithDimensions'], status: 'shipped' },
  { id: 'shapes.modifiers', area: 'shapes', name: 'Path modifiers (Trim Paths, Offset, Roughen, Pucker & Bloat)',
    description: 'Non-destructive outline modifiers; Trim Paths gives line draw-on animation.',
    ui: 'Select a shape > Inspector > Path Modifiers > add', actions: ['editor.addShapeModifier', 'editor.addKeyframe'], status: 'shipped' },
  { id: 'shapes.repeater', area: 'shapes', name: 'Shape repeater',
    description: 'Copies of a shape with accumulating offset / rotation / scale (radial arrays, spirals).',
    ui: 'Inspector (shape) > Repeater toggle', actions: ['editor.toggleShapeRepeater'], status: 'shipped' },
  { id: 'shapes.dash', area: 'shapes', name: 'Dashed strokes', description: 'Dash pattern on shape strokes.',
    ui: 'Inspector (shape) > Stroke > Dash', actions: ['editor.setShapeDash'], status: 'shipped' },
  { id: 'shapes.paths', area: 'shapes', name: 'Pen paths, convert to path, booleans',
    description: 'Pen / pencil drawing, object to path, union / difference / intersection / exclusion.',
    ui: 'Canvas toolbar > Pen (P) / Pencil; Path menu > Object to Path, Union, Difference, Intersection, Exclusion',
    actions: ['editor.convertShapeToPath', 'editor.booleanSelectedShapes'], status: 'shipped', notes: 'Pen drawing itself is pointer-driven (UI only).' },

  // keyframes
  { id: 'keyframes.basic', area: 'keyframes', name: 'Keyframes',
    description: 'Keyframe any animatable property (position, scale, rotation, opacity, sizes, modifier params).',
    ui: 'Inspector > stopwatch icon next to a property; keyframes appear in the timeline',
    actions: ['editor.addKeyframe', 'editor.deleteKeyframes'], status: 'shipped' },
  { id: 'keyframes.easing', area: 'keyframes', name: 'Easing and the graph editor',
    description: 'Linear / bezier / hold / spring interpolation plus 31 named eases (back, elastic, bounce, expo...).',
    ui: 'Select keyframes > right-click > Easing; graph editor in the timeline',
    actions: ['editor.setKeyframeInterpolation', 'editor.setKeyframeEasing'], status: 'shipped' },
  { id: 'keyframes.assistants', area: 'keyframes', name: 'Keyframe assistants',
    description: 'Smoother and Wiggler over selected keyframes; quick fades.',
    ui: 'Select keyframes > right-click > Keyframe Assistant; clip right-click > Fades > Add Fade In / Add Fade Out',
    actions: ['editor.smoothKeyframes', 'editor.wiggleKeyframes', 'editor.addFade'], status: 'shipped' },
  { id: 'keyframes.presets', area: 'keyframes', name: 'Animation presets',
    description: 'One-click entrance / exit / emphasis animations.', ui: 'Inspector > Animate tab > presets',
    actions: ['editor.applyAnimationPreset', 'editor.applyAnimationPresetBatch'], status: 'shipped' },
  { id: 'keyframes.motion-principles', area: 'keyframes', name: 'Motion principles',
    description: 'Anticipation, follow-through, squash & stretch, stagger, and secondary (lagging) motion.',
    ui: 'Inspector > Animate tab > principles', actions: ['editor.applyMotionPrinciple', 'editor.applySecondaryMotion'], status: 'shipped' },
  { id: 'keyframes.motion-path', area: 'keyframes', name: 'Motion paths',
    description: 'Animate a layer along an editable bezier path.', ui: 'Inspector > Motion Path tab',
    actions: ['editor.addMotionPath'], status: 'shipped' },

  // expressions
  { id: 'expressions.code', area: 'expressions', name: 'Expressions',
    description: 'JavaScript expressions on properties (wiggle, time, loops, links), evaluated in a worker.',
    ui: 'Inspector > Code tab > pick a property > type the expression',
    actions: ['agent.setExpression', 'agent.removeExpression'], status: 'shipped',
    notes: 'The Code tab editor is a Pro feature in the UI; expressions applied programmatically still evaluate.' },

  // cloner
  { id: 'cloner.mograph', area: 'cloner', name: 'Cloner + effectors (MoGraph)',
    description: 'One layer that repeats a source in grid / radial / path / field distributions, shaped by random, falloff, step, time and target effectors with per-instance stagger.',
    ui: 'Canvas toolbar > Cloner, or Object > Create Cloner from Selection; Inspector > Cloner tab',
    actions: ['editor.addCloner', 'editor.createClonerFromSelection', 'editor.addClonerEffector', 'editor.removeClonerEffector', 'editor.updateLayerProperty'],
    status: 'shipped', notes: 'Renders as per-instance stamps of the source (v1). Distribution params are edited with updateLayerProperty on the cloner layer.' },

  // particles / procedural
  { id: 'particles.emitter', area: 'particles', name: 'Particles',
    description: 'GPU particle emitter with presets (confetti, sparks, snow, smoke...).',
    ui: 'Canvas toolbar > Particle; Inspector > Particles', actions: ['editor.addParticleLayer', 'editor.updateLayerProperty'], status: 'browser-gated' },
  { id: 'particles.procedural', area: 'particles', name: 'Procedural motion',
    description: 'Attach procedural motion (oscillation, orbit, noise drift) without keyframes.',
    ui: 'Inspector > Loop tab', actions: ['editor.addProceduralBinding'], status: 'shipped' },
  { id: 'particles.patterns-vfx', area: 'particles', name: 'Generative patterns and VFX elements',
    description: 'Animated generative patterns, light leaks, film burns, atmosphere.',
    ui: 'Canvas toolbar > Pattern / Light Leak', actions: ['editor.addGenerativePatternLayer', 'editor.addVfxElement'], status: 'shipped' },

  // physics
  { id: 'physics.rigid-2d', area: 'physics', name: '2D physics',
    description: 'Rapier 2D rigid bodies (dynamic / static / kinematic / ghost), baked to keyframes.',
    ui: 'Inspector > Physics tab', actions: ['editor.addPhysicsBinding', 'editor.updatePhysicsWorld', 'editor.bakePhysics'], status: 'shipped' },

  // masks
  { id: 'masks.parametric', area: 'masks', name: 'Masks and mask reveals',
    description: 'Rectangle / ellipse / star / polygon masks with AE modes, feather, expansion, plus one-click iris / wipe reveals.',
    ui: 'Inspector > Masks tab > add a mask; reveal buttons in the same tab',
    actions: ['editor.addMask', 'editor.removeMask', 'editor.updateMaskProperty', 'editor.addMaskKeyframe', 'editor.applyMaskReveal'], status: 'shipped' },
  { id: 'masks.track-matte', area: 'masks', name: 'Track mattes',
    description: 'Alpha / luma (inverted) matte from the layer above.', ui: 'Inspector (properties) > Matte dropdown',
    actions: ['editor.setTrackMatte'], status: 'shipped' },

  // effects / adjustment
  { id: 'effects.layer', area: 'effects', name: 'Shadow, glow, blur and the effect stack',
    description: 'Per-layer drop shadow, glow, blur and a stack of stylize / colour / glitch effects.',
    ui: 'Inspector > Effects tab', actions: ['editor.enableLayerEffect', 'editor.setLayerEffectParam', 'editor.toggleLayerEffect', 'editor.removeLayerEffect'], status: 'browser-gated' },
  { id: 'effects.beam', area: 'effects', name: 'Light beams', description: 'Laser / light beam layer.',
    ui: 'Right-click the canvas > New Beam / Lightning', actions: ['editor.addBeamLayer'], status: 'browser-gated' },
  { id: 'adjustment.layer', area: 'adjustment', name: 'Adjustment layers',
    description: 'Effects that apply to everything below, with opacity and masks.',
    ui: 'Canvas toolbar > Adjustment Layer', actions: ['editor.addAdjustmentLayer', 'editor.setLayerEffectParam'], status: 'browser-gated' },

  // precomp
  { id: 'precomp.nesting', area: 'precomp', name: 'Precompositions',
    description: 'Nest layers into a sub-composition and edit it via the breadcrumb.',
    ui: 'Object > Precompose (or clip right-click > Precompose); right-click > Open Precomposition',
    actions: ['editor.precomposeSelection', 'editor.enterPrecomp', 'editor.exitPrecomp'], status: 'shipped' },

  // camera
  { id: 'camera.2-5d', area: 'camera-2.5d', name: '2.5D camera',
    description: 'Flat layers as cards in 3D space viewed by an animated camera (After Effects Classic 3D style).',
    ui: 'Canvas toolbar > Camera (3D); Inspector > 3D Layer switch',
    actions: ['editor.addCameraLayer', 'editor.toggleLayer3D'], status: 'partial',
    notes: '2.5D only (no full 3D). Some camera features still need a browser eyeball.' },

  // captions
  { id: 'captions.auto', area: 'captions', name: 'Auto captions',
    description: 'In-browser Whisper transcription of a video/audio clip into styled caption layers.',
    ui: 'Right-click a video/audio clip > Captions > Auto-Caption Clip', actions: [], status: 'browser-gated',
    notes: 'Runs a Whisper model in the browser; not callable headless.' },
  { id: 'captions.from-transcript', area: 'captions', name: 'Captions from a transcript',
    description: 'Commit timed caption layers from segments you already have.', ui: 'n/a (agent / programmatic)',
    actions: ['editor.addCaptionClips'], status: 'shipped' },

  // media
  { id: 'media.import', area: 'media', name: 'Import images, video, audio',
    description: 'Import files (drag & drop or toolbar) into the media pool; WebCodecs decode.',
    ui: 'Canvas toolbar > Image / Video; drag files onto the canvas; Media Pool', actions: [], status: 'browser-gated',
    notes: 'File import needs a real File from the browser; place imported assets with the actions below.' },
  { id: 'media.place', area: 'media', name: 'Place imported media',
    description: 'Put an imported asset on the canvas and fit it.', ui: 'Drag from the Media Pool',
    actions: ['editor.addImageFromAsset', 'editor.addVideoFromAsset', 'editor.fitLayerToCanvas'], status: 'shipped' },

  // export
  { id: 'export.video', area: 'export', name: 'Export MP4',
    description: 'Render the composition to MP4 (H.264 + AAC) through WebGPU + WebCodecs.',
    ui: 'File > Export Video... (Ctrl+E)', actions: [], status: 'browser-gated',
    notes: 'UI-only: open the Export modal and press Export.' },
  { id: 'export.project', area: 'export', name: 'Save / download project',
    description: 'Projects autosave to IndexedDB; download as a .ffx file.', ui: 'File > Save (Ctrl+S) / Download Project (.ffx)',
    actions: [], status: 'shipped' },

  // templates
  { id: 'templates.animation', area: 'templates', name: 'Animation templates',
    description: 'Pre-built animated scenes: titles, lower thirds, charts, lists, logo pops, UI mockups.',
    ui: 'Media Pool > Templates tab > click a template', actions: ['editor.insertAnimationTemplate'], status: 'shipped' },
  { id: 'templates.items', area: 'templates', name: 'Animation items',
    description: 'Ready-made animated elements.', ui: 'Canvas toolbar > Animation Item', actions: ['editor.addAnimationItem'], status: 'shipped' },
];

export interface AgentManifest {
  schemaVersion: number;
  app: { name: string; url: string };
  conventions: Record<string, string>;
  features: readonly AgentFeature[];
  actions: readonly AgentActionSpec[];
}

/** The static part of the manifest (catalogs + version are added by the generator / runtime). */
export function buildAgentManifest(): AgentManifest {
  return {
    schemaVersion: AGENT_MANIFEST_SCHEMA_VERSION,
    app: { name: 'FlashFX Studio', url: 'https://editor.flashfx.app' },
    conventions: {
      units: 'Positions and sizes are composition pixels, origin top-left, Y down. Time is in frames (see getState().fps).',
      colors: 'RGBA arrays with components 0..1, e.g. [1, 0.8, 0.2, 1].',
      scale: 'Scale is a [sx, sy] multiplier: 1 = 100%.',
      runtime: 'In the editor tab: window.__ffxAgent.listFeatures(), .getState(), .run(actionId, args). args is an object keyed by param name or a positional array.',
      undo: 'Actions marked undoable push one normal history command; history.undo reverts it.',
    },
    features: AGENT_FEATURES,
    actions: AGENT_ACTIONS,
  };
}
