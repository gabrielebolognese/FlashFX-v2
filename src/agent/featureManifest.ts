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
  | 'removeExpression'
  | 'createProject'
  | 'listProjects'
  | 'openProject'
  | 'exportMp4'
  | 'getLayer'
  | 'measureText'
  | 'measureString'
  | 'placeText'
  | 'setTrimStartAngle'
  | 'renderFrame'
  | 'renderStrip'
  | 'configureParticles'
  | 'saveProject'
  | 'exportProject'
  | 'importProject'
  | 'importImage'
  | 'importMedia'
  | 'importFont'
  | 'seek'
  | 'play'
  | 'pause'
  | 'addCursor'
  | 'cursorMoveTo'
  | 'cursorClick'
  | 'cursorIcon'
  | 'setTextCaret'
  | 'pixelBlockReveal'
  | 'pixelSparkle';

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
  | 'easings'
  | 'fontFamilies';

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
const CURSOR_ICONS = ['arrow', 'hand', 'ibeam'] as const;
/** Friendly paths of the animated overrides (core/animProps.ts ANIM_PROP_DEFS: kept in sync by verify:anim-props). */
export const ANIM_COLOR_PATHS = ['shape.fillColor', 'shape.strokeColor', 'text.color', 'text.strokeColor', 'glow.color', 'shadow.color'] as const;
export const ANIM_FX_PATHS = ['glow.intensity', 'glow.radius', 'glow.threshold', 'shadow.blurRadius', 'shadow.lightDistance', 'shadow.lightAngle', 'shadow.shadowScale', 'blur.radius', 'blur.strength', 'blur.angle'] as const;

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

  // ----- project / session -----
  { id: 'agent.createProject', store: 'agent', method: 'createProject', undoable: false,
    returns: '{ projectId, compositionId, width, height, fps, durationFrames }',
    description: 'Create a new local project and open it in the editor (like Dashboard > New Project). Saves and closes any open project first; skips the first-run onboarding.',
    params: [
      { name: 'name', type: 'string', optional: true },
      { name: 'format', type: 'string', optional: true, values: ['long', 'short'], description: 'long = 1920x1080 (default), short = 1080x1920.' },
      { name: 'frameRate', type: 'number', optional: true, description: 'Default 30.' },
      { name: 'durationFrames', type: 'number', optional: true, description: 'Default 150.' },
      { name: 'uiMode', type: 'string', optional: true, values: ['starter', 'pro'], description: 'Editor layout: Starter or Full (pro). Omit to keep the current one.' },
      { name: 'clipLength', type: 'string', optional: true, values: ['comp', 'default'], description: 'Length of every NEW layer for the rest of the session: comp = the whole composition, default = the UI 4 s clip. Omit to keep the current setting (starts as default).' },
    ] },
  { id: 'agent.listProjects', store: 'agent', method: 'listProjects', undoable: false,
    returns: '{ activeProjectId, projects: [{ id, name, width, height, fps, durationFrames, modifiedAt (ISO), starred }] } newest first',
    description: 'The local projects in this browser (the Dashboard list, Trash excluded), newest first, and which one is open. Use it to continue an earlier project with agent.openProject, e.g. after the tab was reloaded.',
    params: [{ name: 'limit', type: 'number', optional: true, description: 'Default 20, max 200.' }] },
  { id: 'agent.openProject', store: 'agent', method: 'openProject', undoable: false,
    returns: '{ projectId, name, compositionId, width, height, fps, durationFrames }',
    description: 'Open an existing local project by id (like clicking its card on the Dashboard). Saves and closes the open project first.',
    params: [{ name: 'projectId', type: 'string', description: 'An id from agent.listProjects.' }] },
  { id: 'editor.setDefaultClipLength', store: 'editor', method: 'setDefaultClipLength', undoable: false,
    returns: 'the mode now set',
    description: 'Length of NEW layers for the rest of the session: "comp" makes every new layer span the whole composition (no 4 s cut-off), "default" restores the UI 4-second clip. Existing layers are not changed. Not saved with the project.',
    params: [{ name: 'mode', type: 'string', values: ['comp', 'default'] }] },
  { id: 'agent.exportMp4', store: 'agent', method: 'exportMp4', undoable: false,
    returns: '{ exportId, bytes, mimeType, audioDropped }; read the file with __ffxAgent.readExport(exportId, offset, length)',
    description: 'Render the active composition to MP4 through the real exporter (WebGPU + WebCodecs, same path as File > Export Video). Defaults to the composition size and fps.',
    params: [
      { name: 'width', type: 'number', optional: true },
      { name: 'height', type: 'number', optional: true },
      { name: 'frameRate', type: 'number', optional: true },
      { name: 'bitrate', type: 'number', optional: true, description: 'Bits per second, default 8000000.' },
      { name: 'includeAudio', type: 'boolean', optional: true, description: 'Default true (only matters when the comp has audio).' },
    ] },

  { id: 'agent.getLayer', store: 'agent', method: 'getLayer', undoable: false,
    returns: 'the full layer object (deep copy): transform, content / shape, animators, masks, effects, keyframes',
    description: 'Read every field of one layer, so you can see the exact dot-paths updateLayerProperty / addKeyframe accept and verify what an action produced. Read-only.',
    params: [LAYER_ID] },
  { id: 'agent.measureText', store: 'agent', method: 'measureText', undoable: false,
    returns: '{ frame, center, box {width,height,left,top}, ink {width,height,left,right,top,bottom}, lines, lineWidths, lineHeightPx, fontSize, scale, rotation }',
    description: 'Measure a text layer exactly as the renderer lays it out (comp px), so you can align other layers, size masks and cards, or left-align by centre. ink = the lines (width of the widest line x line count); box = the drawn quad incl. padding. Assumes scale 1 / no rotation for the edges. Read-only.',
    params: [LAYER_ID, { name: 'frame', type: 'number', optional: true, description: 'Default: the playhead.' }] },
  { id: 'agent.placeText', store: 'agent', method: 'placeText', undoable: true,
    returns: '{ anchor, moved [dx,dy], position, keyframesShifted, inkTop, inkBottom, baselineY }',
    description: 'Move a text layer so its visible ink centre (default), its first-line baseline, or its line-box centre lands on (x, y) in comp px, measured in the real face after styling. createQuickText / addText put y on the line-box centre, so mixed-case words sit ~0.15 x size high: style the text first (font, size, weight), then call this. Keyframed position keeps its motion (every key shifts by the same delta). One undo step.',
    params: [LAYER_ID, { name: 'x', type: 'number', optional: true, description: 'Comp px; null / omitted keeps the current x.' },
      { name: 'y', type: 'number' },
      { name: 'anchor', type: 'string', values: ['inkCenter', 'baseline', 'box'], optional: true, description: 'Default inkCenter.' },
      { name: 'frame', type: 'number', optional: true, description: 'Frame to measure at (default: the playhead).' }] },
  { id: 'agent.setTrimStartAngle', store: 'agent', method: 'setTrimStartAngle', undoable: true,
    returns: '{ modifierIndex, angle, pathFraction, offset }',
    description: 'Make a trim-path draw-on start at a clock angle around the shape (0 = 12 o’clock, 90 = 3 o’clock, clockwise): sets the trim offset (shifting its keys) so start + offset lands where a ray from the shape centre at that angle meets the path. For progress rings: stroked circle > editor.convertShapeToPath > addShapeModifier trim > this > keyframe modifiers.N.end 0 -> 1. One undo step.',
    params: [LAYER_ID, { name: 'angle', type: 'number', description: 'Degrees, 0 = 12 o’clock, clockwise.' },
      { name: 'modifierIndex', type: 'number', optional: true, description: 'Default: the first trim modifier.' }] },
  { id: 'agent.renderFrame', store: 'agent', method: 'renderFrame', undoable: false,
    returns: '{ exportId, bytes, frame, width, height, mimeType: "image/png" }; read the PNG with __ffxAgent.readExport(exportId, offset, length)',
    description: 'Render ONE frame of the active composition at full resolution through an offscreen WebGPU renderer, exactly like the MP4 exporter (export-quality motion blur, full-resolution video, no UI overlays, not the scaled preview), as a PNG. For pixel-true checks and side-by-sides with reference frames. Default size = the composition; pass width or height alone to keep the aspect.',
    params: [{ name: 'frame', type: 'number', optional: true, description: 'Default: the playhead.' }, { name: 'width', type: 'number', optional: true }, { name: 'height', type: 'number', optional: true }] },
  { id: 'agent.renderStrip', store: 'agent', method: 'renderStrip', undoable: false,
    returns: '{ exportId, bytes, frames, columns, tileWidth, tileHeight, width, height, mimeType: "image/png" }',
    description: 'Render several frames (the exporter path, like renderFrame) into one labelled contact sheet PNG: a quick way to check a whole move (entrance, rest, exit) in one image.',
    params: [{ name: 'frames', type: 'number[]', description: 'Up to 64 frame numbers.' }, { name: 'columns', type: 'number', optional: true, description: 'Default min(4, frames).' },
      { name: 'tileWidth', type: 'number', optional: true, description: 'Width of each tile in px (default min(480, comp width)).' },
      { name: 'labels', type: 'boolean', optional: true, description: 'Draw the frame number on each tile (default true).' }] },
  { id: 'agent.measureString', store: 'agent', method: 'measureString', undoable: false,
    returns: '{ width, height, lines, lineWidths, lineHeightPx, box {width, height}, fontFamily, fontSize }',
    description: 'Measure a string in a font WITHOUT creating a layer (same layout code as the renderer, comp px), e.g. to size a pill or a caret before building it. letterSpacing / lineHeight use the same units as the text layer animOverrides. Read-only.',
    params: [{ name: 'text', type: 'string' }, { name: 'fontFamily', type: 'string', optional: true, description: 'Default Inter.' },
      { name: 'fontSize', type: 'number', optional: true, description: 'px, default 48.' }, { name: 'fontWeight', type: 'number', optional: true },
      { name: 'fontStyle', type: 'string', optional: true, values: ['normal', 'italic'] }, { name: 'letterSpacing', type: 'number', optional: true },
      { name: 'lineHeight', type: 'number', optional: true, description: 'Multiplier, default 1.2.' }] },
  { id: 'agent.saveProject', store: 'agent', method: 'saveProject', undoable: false,
    returns: '{ projectId, compositions }',
    description: 'Save the open project (every composition) to local storage now (like File > Save, Ctrl+S). The app also autosaves.',
    params: [] },
  { id: 'agent.exportProject', store: 'agent', method: 'exportProject', undoable: false,
    returns: '{ exportId, bytes, fileName, projectId, mimeType }; read the file with __ffxAgent.readExport(exportId, offset, length)',
    description: 'Save, then bundle the open project as an editable .ffx file (every composition + imported media + preview), the same bundle as File > Download Project (.ffx). Re-open it with agent.importProject or File > Import Project.',
    params: [] },
  { id: 'agent.importProject', store: 'agent', method: 'importProject', undoable: false,
    returns: '{ projectId, name, compositionId, layers, width, height }',
    description: 'Import a .ffx project (base64 of the file bytes) as a new local project and open it in the editor (like File > Import Project). Saves and closes any open project first.',
    params: [
      { name: 'data', type: 'string', description: 'Base64 of the .ffx file (a data: URL is accepted too).' },
      { name: 'fileName', type: 'string', optional: true },
    ] },
  { id: 'agent.importImage', store: 'agent', method: 'importImage', undoable: false,
    returns: '{ assetId, width, height, name }; place it with editor.addImageFromAsset(assetId, x, y)',
    description: 'Import an image (base64 bytes: PNG, JPEG, WebP, GIF or SVG) into the open project media pool. SVG is rasterized to a PNG whose longest side is rasterSize px (default 1024).',
    params: [
      { name: 'data', type: 'string', description: 'Base64 of the image file (a data: URL is accepted too).' },
      { name: 'fileName', type: 'string', description: 'Used for the asset name and, without mimeType, to infer the type from the extension.' },
      { name: 'mimeType', type: 'string', optional: true },
      { name: 'rasterSize', type: 'number', optional: true, description: 'SVG only: longest side of the rasterized PNG in px (default 1024, max 8192).' },
    ] },
  { id: 'agent.importMedia', store: 'agent', method: 'importMedia', undoable: false,
    returns: '{ kind: "video" | "audio" | "image", assetId, name, ... } (video: width, height, duration s, frameRate, hasAudio, codec, compFrames; audio: duration, sampleRate, channels, compFrames; image: width, height). Place it with editor.addVideoFromAsset / editor.addAudioFromAsset / editor.addImageFromAsset',
    description: 'Import a video (MP4, MOV, WebM, MKV), audio (MP3, WAV, M4A, AAC, OGG, FLAC) or image file into the open project media pool, headless (the same import the Media Pool uses; persisted with the project and carried by export_project). The type comes from mimeType or the file extension. Large files: stage the bytes in order with __ffxAgent.writeUpload(uploadId, offset, base64) and pass uploadId (the MCP import_media tool does this for you); small files can pass data inline.',
    params: [
      { name: 'data', type: 'string', optional: true, description: 'Base64 of the whole file (omit when passing uploadId).' },
      { name: 'fileName', type: 'string', description: 'Asset name; its extension tells the media type when mimeType is omitted.' },
      { name: 'mimeType', type: 'string', optional: true },
      { name: 'uploadId', type: 'string', optional: true, description: 'Id of an upload staged with __ffxAgent.writeUpload (consumed by the import).' },
      { name: 'rasterSize', type: 'number', optional: true, description: 'SVG only: longest side of the rasterized PNG in px (default 1024).' },
    ] },
  { id: 'agent.importFont', store: 'agent', method: 'importFont', undoable: false,
    returns: '{ id, family, fileName, weight, style, format, persisted, use }; put `family` in "content.spans.0.style.fontFamily" (or editor.styleTextWord / agent.measureString)',
    description: 'Import a font file (base64 bytes: WOFF2, WOFF, TTF or OTF) into the browser font library, like Inspector > Font > Import: stored in IndexedDB (every project in this browser, survives reloads) and registered with the browser, so text set in the returned family renders in it (preview, renderFrame, MP4). Import several files under one family with their weight / style to get a real Bold / Italic. Bundled families are listed in listFeatures().catalogs.fontFamilies.',
    params: [
      { name: 'data', type: 'string', description: 'Base64 of the font file (a data: URL is accepted too). Max 20 MB.' },
      { name: 'fileName', type: 'string', description: 'Used for the family name when the font has no readable name table (always the case for WOFF2) and no family is given.' },
      { name: 'family', type: 'string', optional: true, description: 'Family name to register it under (recommended for WOFF2).' },
      { name: 'weight', type: 'number', optional: true, description: 'Weight descriptor 1..1000 (default: read from the font when it is TTF / OTF / WOFF, else any weight resolves to it).' },
      { name: 'style', type: 'string', optional: true, values: ['normal', 'italic'], description: 'Default: read from the font when possible.' },
    ] },

  // ----- composition / playback -----
  { id: 'editor.setCompositionSetting', store: 'editor', method: 'setCompositionSetting', undoable: true,
    description: 'Change a numeric composition setting.',
    params: [{ name: 'key', type: 'string', values: ['width', 'height', 'frameRate', 'durationFrames', 'minimumDurationFrames', 'shutterAngle', 'shutterPhase', 'motionBlurSamples'] }, { name: 'value', type: 'number' }] },
  { id: 'editor.setCompositionSize', store: 'editor', method: 'setCompositionSize', undoable: true,
    description: 'Resize the frame (e.g. 1920x1080) and reflow top-level layers by their constraints.',
    params: [{ name: 'width', type: 'number' }, { name: 'height', type: 'number' }] },
  // The playhead is owned by the timeline store's playbackController (the editor store's
  // setCurrentFrame / setPlaying only set fields the preview does not follow, so they are not listed).
  { id: 'agent.seek', store: 'agent', method: 'seek', undoable: false, returns: 'the clamped current frame',
    description: 'Move the playhead and render that frame (same as dragging the timeline playhead).', params: [{ name: 'frame', type: 'number' }] },
  { id: 'agent.play', store: 'agent', method: 'play', undoable: false, returns: 'isPlaying',
    description: 'Start preview playback (Space).', params: [] },
  { id: 'agent.pause', store: 'agent', method: 'pause', undoable: false, returns: 'the current frame',
    description: 'Pause preview playback.', params: [] },
  { id: 'editor.addBackgroundLayer', store: 'editor', method: 'addBackgroundLayer', undoable: true, params: [], returns: 'the new background layer id (null when the stack already has 10)',
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
  { id: 'agent.setTextCaret', store: 'agent', method: 'setTextCaret', undoable: true,
    returns: 'the caret now on the layer (TextCaret), or null',
    description: 'Typing caret (B35): a bar, block or underline drawn right after the last revealed glyph, so it rides a type-on (agent.applyTextAnimatorPreset "type-on") frame by frame. Fields merge into the current caret; null turns it off. Solid while typing, blinking before / after (blinkRate cycles per second, 0 = solid). Single-line text. One undo step (updateLayerProperty "caret"; tweak one field later with "caret.<field>").',
    params: [LAYER_ID, { name: 'caret', type: '{ style?: "bar" | "block" | "underline"; color?: [r, g, b, a]; width?: number; height?: number; gap?: number; offsetY?: number; radius?: number; blinkRate?: number; solidWhileTyping?: boolean; startFrame?: number; endFrame?: number } | null', optional: true,
      description: 'Defaults: style bar, colour = text colour, bar 6% / block 55% of the font size wide, height = font size, blinkRate 1.' }] },
  { id: 'editor.styleTextRange', store: 'editor', method: 'styleTextRange', undoable: true,
    description: 'Mixed styles: give characters [start, end) of a text layer their own face / weight / italic / colour (raw-text indices).',
    params: [LAYER_ID, { name: 'start', type: 'number' }, { name: 'end', type: 'number' },
      { name: 'style', type: '{ fontFamily?: string; fontWeight?: number; fontStyle?: "normal" | "italic"; color?: [r, g, b, a] (0..1); fill?: TextGradientFill }' }] },
  { id: 'editor.styleTextWord', store: 'editor', method: 'styleTextWord', undoable: true,
    description: 'Mixed styles: restyle the Nth whitespace-delimited word (0-based), e.g. an italic-serif accent word. exclusive=true resets every other word first.',
    params: [LAYER_ID, { name: 'wordIndex', type: 'number' },
      { name: 'style', type: '{ fontFamily?: string; fontWeight?: number; fontStyle?: "normal" | "italic"; color?: [r, g, b, a] (0..1); fill?: TextGradientFill }' },
      { name: 'exclusive', type: 'boolean', optional: true }] },
  { id: 'editor.clearTextStyles', store: 'editor', method: 'clearTextStyles', undoable: true,
    description: 'Mixed styles: reset the whole text to its first span style.', params: [LAYER_ID] },
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
  { id: 'editor.addShapeLayer', store: 'editor', method: 'addShapeLayer', undoable: true, returns: 'the new layer id',
    description: 'Add a shape with explicit geometry and CLEAN defaults in one undo step: no stroke unless you pass stroke / strokeWidth, your fill, corner radius and name. Prefer this over addShapeWithDimensions (which adds the UI default 1 px grey stroke). An ellipse with width != height is a circle stretched by the layer scale.',
    params: [{ name: 'opts', type: '{ type: "rectangle" | "circle" | "star" | "polygon"; x: number; y: number; width: number; height: number; fill?: [r, g, b, a]; stroke?: [r, g, b, a]; strokeWidth?: number; radius?: number; name?: string; points?: number; innerRatio?: number }', description: 'x, y = centre (comp px); colours RGBA 0..1; fill defaults to white; strokeWidth defaults to 2 when stroke is given, else 0.' }] },
  { id: 'editor.addShapeWithDimensions', store: 'editor', method: 'addShapeWithDimensions', undoable: true, returns: 'new layer id (activeLayerId)',
    description: 'Add a shape with an explicit position and size (comp px).',
    params: [{ name: 'shapeType', type: 'string', values: SHAPE_TYPES }, { name: 'x', type: 'number' }, { name: 'y', type: 'number' }, { name: 'width', type: 'number' }, { name: 'height', type: 'number' }] },
  { id: 'editor.setShapeMorph', store: 'editor', method: 'setShapeMorph', undoable: true,
    description: 'Shape morph in one undo step: the shape layer becomes a path whose outline morphs through the poses (square -> circle -> star -> pill ...). Each pose: { frame, shape, ease } where shape is { type: "rectangle", width, height, radius? } | { type: "ellipse", width, height } | { type: "star", width, height, points?, innerRatio? } | { type: "polygon", width, height, sides? } | { type: "path", points: [[x, y], ...], closed? } (layer-local px, centred on the layer position) and ease shapes the morph to the NEXT pose (named ease / CSS keyword / cubic-bezier quad / "hold"; backOut overshoots the shape). align (default true) matches start point and winding so nothing twists. Fill, stroke, gradients and transform are kept.',
    params: [LAYER_ID,
      { name: 'poses', type: 'Array<{ frame: number; shape: OutlineSpec; ease?: string | [number, number, number, number] }>' },
      { name: 'align', type: 'boolean', optional: true, description: 'Default true (best start point + winding per pose pair).' }] },
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
    description: 'Set a keyframe. Paths: "transform.position" [x,y], "transform.scale" [sx,sy] (1 = 100%), "transform.rotation" deg, "transform.opacity" 0..1, "animOverrides.fontSize", "animOverrides.letterSpacing", "shape.width", "modifiers.0.end", etc. Colour keyframes (RGBA 0..1, mixed in linear light): "shape.fillColor", "shape.strokeColor", "text.color", "text.strokeColor", "glow.color", "shadow.color". Effect params: "glow.intensity" / "glow.radius" / "glow.threshold", "shadow.blurRadius" / "shadow.lightDistance" / "shadow.lightAngle" / "shadow.shadowScale", "blur.radius" / "blur.strength" / "blur.angle", and effect-stack params as "effect.<type>.<paramIndex>" (same ids as setLayerEffectParam). These create an animated override on the first key (it lives under layer.animProps); the effect must be enabled for its keys to show.',
    params: [LAYER_ID, { name: 'propertyPath', type: 'string' }, { name: 'frame', type: 'number' }, { name: 'value', type: 'number | [number, number] | [r, g, b, a]' }] },
  { id: 'editor.setKeyframes', store: 'editor', method: 'setKeyframes', undoable: true,
    description: 'Write a whole animation curve on one property in ONE undo step, each keyframe with its own outgoing ease: [{ frame, value, ease }]. ease (shapes the segment to the NEXT key): "linear" (default) | "hold" | "spring" | a named ease (cubicOut, expoOut, circOut, backOut, elasticOut, ... see the easings catalog) | "ease" | "ease-in" | "ease-out" | "ease-in-out" | a cubic-bezier [x1, y1, x2, y2] (CSS semantics, y may overshoot for pops). Same paths as addKeyframe (incl. colour and effect paths). Without merge the keys REPLACE the property\'s keyframes; merge=true keeps the others. Errors (nothing applied) on an unknown path or a value of the wrong shape.',
    params: [LAYER_ID, { name: 'propertyPath', type: 'string' },
      { name: 'keyframes', type: 'Array<{ frame: number; value: number | [number, number] | [r, g, b, a]; ease?: string | [number, number, number, number] }>' },
      { name: 'merge', type: 'boolean', optional: true, description: 'true = keep keyframes at other frames (default false = replace).' }] },
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
  { id: 'agent.configureParticles', store: 'agent', method: 'configureParticles', undoable: true,
    returns: '{ preset, seed, config } (the full emitter config now on the layer)',
    description: 'Set a particle layer emitter in one undo step: start from a preset (or the current config when presetId is null) and merge EmitterConfig overrides, e.g. { spawnRate: 0, burstCount: 120, emitterShape: "circle", emitterRadius: 40, colorOverLife: [...] }. Fields: src/particles/types.ts.',
    params: [LAYER_ID, { name: 'presetId', type: 'string | null', optional: true, catalog: 'particlePresets' },
      { name: 'overrides', type: 'Partial<EmitterConfig>', optional: true }, { name: 'seed', type: 'number', optional: true }] },
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
  // B53 - camera beats + corner pin (render proven by gpu:camera-cards).
  { id: 'editor.cameraMove', store: 'editor', method: 'cameraMove', undoable: true,
    returns: 'the keyed property paths, e.g. ["transform.position", "transform.positionZ", "camera.zoom"]',
    description: 'One camera beat in ONE undo step: at `frame`, move the camera over `durationFrames` to the target, with `ease` on the move (same ease specs as setKeyframes). The start key holds the current camera value at `frame`; keys inside the move are dropped, others kept. durationFrames 0 / omitted = a single key at `frame` (arrive there from the previous key). Default camera: eye (W/2, H/2, -zoom) aimed at (W/2, H/2, 0), zoom = 50mm (50*W/36 px), which frames z = 0 at 1:1. Moving the eye closer (z toward 0) pushes in; a larger zoom narrows the lens.',
    params: [{ name: 'cameraLayerId', type: 'string', description: 'A camera layer id (editor.addCameraLayer returns one).' }, { name: 'frame', type: 'number' },
      { name: 'to', type: '{ position?: [x, y] | [x, y, z]; pointOfInterest?: [x, y] | [x, y, z]; zoom?: number; orientation?: [rx, ry, rz] }', description: 'position = the eye (comp px, z < 0 in front of the comp plane); pointOfInterest = two-node aim point; zoom px; orientation = one-node aim (degrees).' },
      { name: 'durationFrames', type: 'number', optional: true, description: 'Default 0 (one key at frame).' },
      { name: 'ease', type: 'string | [number, number, number, number]', optional: true, catalog: 'easings', description: 'Ease of the move (default linear).' }] },
  { id: 'editor.setCornerPin', store: 'editor', method: 'setCornerPin', undoable: true,
    description: 'Corner pin (AE Corner Pin / keystone): warp a shape, text, image, video or precomp layer onto four comp-px points that form a convex quad. While pinned the four pins ARE the placement (position / rotation / scale / anchor / 3D are not applied). Pinned box: the shape width x height (path shapes: vertex bounds), the text drawn box (agent.measureText box), the full image / video / precomp frame. Creates static pins (replacing pin keys); animate them with setKeyframes on cornerPin.topLeft / topRight / bottomRight / bottomLeft. null removes the pin.',
    params: [LAYER_ID, { name: 'corners', type: '{ topLeft: [x, y]; topRight: [x, y]; bottomRight: [x, y]; bottomLeft: [x, y] } | null' }] },

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
  { id: 'editor.addAudioFromAsset', store: 'editor', method: 'addAudioFromAsset', undoable: true,
    description: 'Place an already-imported audio asset as an audio layer from frame 0 (its clip spans the audio duration).', params: [{ name: 'assetId', type: 'string' }] },
  { id: 'editor.fitLayerToCanvas', store: 'editor', method: 'fitLayerToCanvas', undoable: true,
    description: 'Scale an image/video layer to fit the canvas.', params: [LAYER_ID] },

  // ----- templates -----
  { id: 'editor.insertAnimationTemplate', store: 'editor', method: 'insertAnimationTemplate', undoable: true,
    description: 'Insert a pre-built animated template (title, lower third, chart, scene...) at the playhead.',
    params: [{ name: 'id', type: 'string', catalog: 'animationTemplates' }, { name: 'center', type: '[number, number]', optional: true }] },
  { id: 'editor.addAnimationItem', store: 'editor', method: 'addAnimationItem', undoable: true, returns: 'new layer id (activeLayerId)',
    description: 'Add an animation item (ready-made animated element).', params: [{ name: 'presetName', type: 'string', catalog: 'animationItems' }] },

  // ----- B54 pixel-block dissolve / build-on + 8-bit sparkle (core/pixelBlocks.ts, animation-templates/pixelSparkle.ts) -----
  { id: 'agent.pixelBlockReveal', store: 'agent', method: 'pixelBlockReveal', undoable: true,
    returns: '{ maskId, maskIndex, region, blockSize, order, direction, keys }',
    description: 'Pixel-block dissolve ("out") or build-on ("in") on a masked layer (shape, text, image, video, lottieIcon): appends ONE intersect mask whose rectangle is the block grid region and whose keyed "blocks.progress" (0 -> 1) shows or hides whole seeded squares, rendered per pixel on the GPU. Frame-pure (seeded hash, scrubbing is identical). Edit later with editor.updateMaskProperty (path "blocks.size", "blocks.seed", "blocks.order", "blocks.angle", "blocks.jitter", "blocks.direction"; re-time by setting "blocks.progress" or calling this again on a fresh layer). One undo step.',
    params: [LAYER_ID, { name: 'options', type: '{ direction: "in" | "out"; startFrame: number; durationFrames: number; region?: { x: number; y: number; width: number; height: number }; blockSize?: number; order?: "random" | "directional" | "center"; angle?: number; jitter?: number; seed?: number; stepFrames?: number; name?: string }',
      description: 'region: comp px, top-left origin, default the whole comp (pass the layer box for directional / centre orders so the sweep spans the layer). blockSize px (default 16). angle: directional sweep in degrees (0 = left to right, 90 = top to bottom). jitter 0..1 (default 0.35). stepFrames 1 = new blocks every frame, 2 = on twos.' }] },
  { id: 'agent.pixelSparkle', store: 'agent', method: 'pixelSparkle', undoable: true,
    returns: '{ groupId, squareIds, cells, steps }',
    description: '8-bit sparkle: stepped, seeded squares that flicker and crawl in a ring around a target box (a word, a button) without covering it. Lands as editable layers: a group at the box centre holding `count` square shape layers with hold keys on position and opacity. Frame-pure. One undo step.',
    params: [{ name: 'options', type: '{ box: { x: number; y: number; width: number; height: number }; color: [r, g, b, a]; startFrame: number; durationFrames: number; count?: number; blockSize?: number; margin?: number; stepFrames?: number; density?: number; wander?: number; seed?: number; name?: string }',
      description: 'box: comp px, top-left origin. count default 12, blockSize 16, margin 3 blocks, stepFrames 2, density 0.6 (share of squares on per step), wander 0.65 (chance to crawl to a neighbouring cell instead of jumping).' }] },

  // ----- B51 cursor rig (animation-templates/cursorRig.ts) -----
  { id: 'agent.addCursor', store: 'agent', method: 'addCursor', undoable: true,
    returns: '{ cursorId, icons: { arrow, hand, ibeam }, frame }',
    description: 'Add a pointer cursor: a group (its position = the hotspot, the arrow tip) holding an arrow, a hand and an I-beam icon, one visible. On screen from `frame` to the comp end. Then script it with agent.cursorMoveTo / cursorClick / cursorIcon (author in time order). One undo step.',
    params: [{ name: 'icon', type: 'string', optional: true, values: CURSOR_ICONS, description: 'Default arrow.' },
      { name: 'x', type: 'number', optional: true, description: 'Hotspot x (comp px), default the comp centre.' }, { name: 'y', type: 'number', optional: true },
      { name: 'frame', type: 'number', optional: true, description: 'First frame on screen (default 0).' },
      { name: 'color', type: '[r, g, b, a]', optional: true, description: 'Icon fill (default white, dark outline).' },
      { name: 'size', type: 'number', optional: true, description: 'Icon height in px (default 36).' },
      { name: 'name', type: 'string', optional: true }] },
  { id: 'agent.cursorMoveTo', store: 'agent', method: 'cursorMoveTo', undoable: true,
    returns: '{ cursorId, from, to, startFrame, endFrame }',
    description: 'Move the cursor from wherever it is at `frame` to (x, y): two position keys with a ballistic ease-out (fast start, long settle; the template rig fitted as cubic-bezier [0.38, 1, 0.76, 1]) along a gentle arc (spatial tangents). It ARRIVES exactly at frame + durationFrames. Keys stay editable (timeline / graph editor / editor.setKeyframes on the group "transform.position"). One undo step.',
    params: [{ name: 'cursorId', type: 'string', description: 'The id agent.addCursor returned.' }, { name: 'frame', type: 'number', description: 'Frame the move starts.' },
      { name: 'x', type: 'number' }, { name: 'y', type: 'number' },
      { name: 'durationFrames', type: 'number', optional: true, description: 'Default from the distance like a real hand: 190 ms + 0.32 ms/px, clamped 220..450 ms.' },
      { name: 'ease', type: 'string | [number, number, number, number]', optional: true, catalog: 'easings', description: 'Any setKeyframes ease (named, CSS keyword, cubic-bezier quad, e.g. a measured one). Default ballistic.' },
      { name: 'arc', type: 'number', optional: true, description: 'Path bow as a fraction of the distance (default 0.08; negative bows the other way; 0 = straight).' }] },
  { id: 'agent.cursorClick', store: 'agent', method: 'cursorClick', undoable: true,
    returns: '{ cursorId, frame, rippleId, responseFrame }: make the clicked UI react at responseFrame (2 frames later reads as software)',
    description: 'Click: the cursor squashes (scale x squash exactly ON `frame`, pressed over 2 frames, released over 4) and, by default, an expanding ring ("Click ripple" layer) fades out at the hotspot. One undo step.',
    params: [{ name: 'cursorId', type: 'string' }, { name: 'frame', type: 'number' },
      { name: 'ripple', type: 'boolean', optional: true, description: 'Default true.' },
      { name: 'squash', type: 'number', optional: true, description: 'Scale factor at the click frame (default 0.82).' },
      { name: 'rippleColor', type: '[r, g, b, a]', optional: true, description: 'Ring colour (default white 90%).' }] },
  { id: 'agent.cursorIcon', store: 'agent', method: 'cursorIcon', undoable: true,
    returns: '{ cursorId, frame, from, icon }',
    description: 'Swap the cursor icon on `frame` (hold step on the icon opacities): e.g. hand over a button, I-beam over a text field. One undo step.',
    params: [{ name: 'cursorId', type: 'string' }, { name: 'frame', type: 'number' }, { name: 'icon', type: 'string', values: CURSOR_ICONS }] },
];

// ---------------------------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------------------------

export const AGENT_FEATURES: readonly AgentFeature[] = [
  // composition
  { id: 'composition.project', area: 'composition', name: 'Create a project',
    description: 'Start a new local project (16:9 long form or 9:16 short form) and open it in the editor.',
    ui: 'Dashboard > New Project (pick Long form / Short form)', actions: ['agent.createProject'], status: 'shipped' },
  { id: 'composition.open-project', area: 'composition', name: 'Continue an earlier project',
    description: 'List the local projects in this browser and re-open one, so an agent can pick up where it left off (after a reload, or the next day).',
    ui: 'Dashboard > click a project card', actions: ['agent.listProjects', 'agent.openProject'], status: 'shipped' },
  { id: 'composition.clip-length', area: 'composition', name: 'New layers span the composition',
    description: 'Make every new layer as long as the composition instead of a 4-second clip (agent sessions: create_project clipLength "comp").',
    ui: 'Agent / MCP only (the UI adds 4 s clips; drag a clip end to stretch it)', actions: ['agent.createProject', 'editor.setDefaultClipLength'], status: 'shipped' },
  { id: 'composition.settings', area: 'composition', name: 'Composition size, fps and duration',
    description: 'Set the frame size (e.g. 1920x1080 or 1080x1920), frame rate and minimum duration.',
    ui: 'File > Project Settings... (or the composition settings in the Inspector with nothing selected)',
    actions: ['editor.setCompositionSize', 'editor.setCompositionSetting'], status: 'shipped' },
  { id: 'composition.background', area: 'composition', name: 'Background layers',
    description: 'Solid / gradient background stack behind every layer.', ui: 'Inspector with nothing selected > Background',
    actions: ['editor.addBackgroundLayer', 'editor.updateBackgroundLayer'], status: 'shipped' },
  { id: 'composition.playback', area: 'composition', name: 'Playhead and preview',
    description: 'Scrub, play and pause the WebGPU preview.', ui: 'Timeline playhead; Space to play/pause',
    actions: ['agent.seek', 'agent.play', 'agent.pause'], status: 'browser-gated', notes: 'Preview renders through WebGPU.' },
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
    actions: ['agent.getLayer', 'editor.selectLayer', 'editor.selectAllLayers', 'editor.deselectAll', 'editor.updateLayerProperty', 'editor.renameLayer', 'editor.removeLayer', 'editor.removeLayers', 'editor.duplicateSelection', 'editor.reorderLayers'],
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
    actions: ['editor.addText', 'editor.createQuickText', 'agent.setTextContent', 'agent.measureText', 'agent.measureString', 'agent.placeText', 'editor.updateLayerProperty'], status: 'shipped' },
  { id: 'text.animators', area: 'text', name: 'Text animators (range selectors)',
    description: 'After-Effects-style per-character / word / line animators driven by a range selector: type-on, fade, pop, cascade, slide, rise, blur, tumble, scatter, colour wave, delete. Split by character, character excluding spaces, word or line; deltas for position, scale, rotation, 3D rotation, blur, opacity, tracking in em (tracking burst), fill colour, skew and seeded scatter; selector shapes (ramp up/down, triangle, round, smooth, square) with ease high/low, seeded randomize order and keyframable start / end / offset; animators stack. Works on multi-line, wrapped and fixed-box text.',
    ui: 'Select a text layer > Inspector (properties) > Animators section > pick a preset (edit split, deltas incl. Tracking em, selector shape / ease / reveal timing there)',
    actions: ['agent.applyTextAnimatorPreset', 'editor.updateLayerProperty', 'editor.setKeyframes'], status: 'shipped',
    notes: 'Glyphs land exactly where the static text draws (multi-line, wrapped, fixed / fixedWidth boxes, left / centre / right). Reveal presets hide every unit (the first included) until their start frame. Defaults match the UI: start frame 0, 30 frames. Full control: editor.updateLayerProperty(layerId, "animators", TextAnimator[]) with splitMode character|characterNoSpaces|word|line and delta {position, scale, rotation, rotationX, rotationY, blur, opacity, tracking, fillColor [r,g,b,a], skew (deg), scatter [x,y] px}; selector {randomizeOrder, seed} for a seeded order. Keyframe the selector with editor.setKeyframes(layerId, "animators.<i>.start" | ".end" | ".offset", keys). Layer path reflowHidden: true re-centres a line on its visible glyphs (centred type-on / delete). With the layer motion blur switch on, each glyph streaks with its own animator motion.' },
  { id: 'text.mixed-styles', area: 'text', name: 'Mixed styles / accent word',
    description: 'One word (or any character range) of a text in its own font, weight, italic and colour, e.g. an italic-serif accent word in a kinetic title. Works with text animators.',
    ui: 'Select a text layer > Inspector > Font > Accent (pick the word, then its font / italic / colour)',
    actions: ['editor.styleTextWord', 'editor.styleTextRange', 'editor.clearTextStyles'], status: 'shipped',
    notes: 'Drawn per glyph (single-line, multi-line and wrapped text). Editing the base font / colour in the Inspector restyles every base span and keeps the accent. agent.setTextContent resets to one style.' },
  { id: 'text.fonts', area: 'text', name: 'Font library + font import',
    description: 'Bundled OFL families (incl. Inter 400-700, Inter Tight, Archivo Expanded wide grotesque, Montserrat Alternates, Unbounded, Nunito, Instrument Serif + true italic, Playfair Display + true italic, Damion script, VT323 / Silkscreen pixel, Space Mono) and importing any WOFF2 / WOFF / TTF / OTF. A weight between bundled ones resolves to the nearest face like CSS (500 -> 500 or 400, 600 -> 600 or 700); italic uses a true italic face when bundled, else a synthesized oblique.',
    ui: 'Select a text layer > Inspector > Font > Family (grouped list; the upload button imports a font file)',
    actions: ['agent.importFont', 'agent.measureString', 'editor.updateLayerProperty', 'editor.styleTextWord'], status: 'shipped',
    notes: 'Family names: listFeatures().catalogs.fontFamilies (bundled weights / italics per family in each description; the in-page window.__ffxAgent.listFeatures() also lists fonts imported in this browser). Set the face with editor.updateLayerProperty(layerId, "content.spans.0.style.fontFamily" | "content.spans.0.style.fontWeight" | "content.spans.0.style.fontStyle", value). New families load on first use; renderFrame / exportMp4 / seek / measureString wait for them. MCP: import_font {path, family?}. Imported fonts live in the browser font library, not inside the .ffx project file.' },
  { id: 'text.caret', area: 'text', name: 'Typing caret',
    description: 'A bar (I-beam), block or underline caret that sits right after the last revealed glyph and rides a type-on frame by frame; solid while typing, blinking before and after; colour, size, gap, rounded corners, visible window.',
    ui: 'Agent / MCP: agent.setTextCaret (Inspector control: not yet)',
    actions: ['agent.setTextCaret', 'editor.updateLayerProperty'], status: 'shipped',
    notes: 'Lives in layer.caret (TextCaret in src/core/types.ts), resolved as one rectangle stamp (core/textCaret.ts), frame-pure. Single-line text only (like per-glyph animators); not on text-on-path. Pair with agent.applyTextAnimatorPreset(layerId, "type-on", start, duration). Block caret = style "block" (e.g. lime [0.6, 0.85, 0.16, 1]).' },
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
    actions: ['editor.addShapeLayer', 'editor.addRectangle', 'editor.addCircle', 'editor.addStar', 'editor.addPolygon', 'editor.addShapeWithDimensions'], status: 'shipped',
    notes: 'Agents: use editor.addShapeLayer (explicit size, fill, radius, name, no default stroke).' },
  { id: 'shapes.modifiers', area: 'shapes', name: 'Path modifiers (Trim Paths, Offset, Roughen, Pucker & Bloat)',
    description: 'Non-destructive outline modifiers; Trim Paths gives line draw-on animation.',
    ui: 'Select a shape > Inspector > Path Modifiers > add', actions: ['editor.addShapeModifier', 'editor.addKeyframe', 'agent.setTrimStartAngle'], status: 'shipped' },
  { id: 'shapes.morph', area: 'shapes', name: 'Shape morph',
    description: 'Morph a shape through outlines (rect, rounded rect, ellipse, star, polygon, free points) with an ease per morph and automatic correspondence so outlines do not twist; different vertex counts morph.',
    ui: 'Select a pen path > Inspector > Path Animation > Add Pose at the playhead (poses morph linearly in the UI; eases and parametric poses are agent / MCP: editor.setShapeMorph)',
    actions: ['editor.setShapeMorph'], status: 'shipped',
    notes: 'Pixel-proven headless by npm run gpu:anim-props. Combine with transform keys (scale / rotation) and colour keys (shape.fillColor) for the heavy-morph look.' },
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
    actions: ['editor.setKeyframes', 'editor.setKeyframeInterpolation', 'editor.setKeyframeEasing'], status: 'shipped',
    notes: 'Agents: editor.setKeyframes writes every key + its own ease (named, CSS keyword or a fitted cubic-bezier quad) in one call and one undo step.' },
  { id: 'keyframes.color', area: 'keyframes', name: 'Colour keyframes',
    description: 'Animate shape fill / stroke colour, text colour / stroke colour and glow / shadow colour: eased or hold (step) swaps, mixed in linear light so midpoints do not go muddy.',
    ui: 'Agent / MCP: editor.addKeyframe or editor.setKeyframes on a colour path; the keys show in the timeline under "Animated" (Inspector colour stopwatch: not yet)',
    actions: ['editor.setKeyframes', 'editor.addKeyframe', 'editor.deleteKeyframes', 'editor.setKeyframeEasing'], status: 'shipped',
    notes: `Paths: ${ANIM_COLOR_PATHS.join(', ')}. Values RGBA 0..1. The static colour stays the value before the first key. Stored under layer.animProps (absent in old projects: unchanged). A material / gradient fill on a shape overrides the flat fill colour.` },
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
    ui: 'Canvas toolbar > Particle; Inspector > Particles', actions: ['editor.addParticleLayer', 'agent.configureParticles', 'editor.updateLayerProperty'], status: 'browser-gated',
    notes: 'A new particle layer starts as the "fire" preset. Use agent.configureParticles(layerId, presetId, overrides) instead of hand-writing particle.emitterConfig (a JSON string).' },
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
  { id: 'masks.pixel-blocks', area: 'masks', name: 'Pixel-block dissolve / build-on + 8-bit sparkle',
    description: 'Seeded pixel-block transitions on any masked layer (random, directional sweep or centre-out; build-on or dissolve; stepped on ones or twos) and an 8-bit sparkle of flickering squares around a target box.',
    ui: 'Agent / MCP only (the mask lands in the layer Masks list; its progress keys are ordinary keys)',
    actions: ['agent.pixelBlockReveal', 'agent.pixelSparkle', 'editor.updateMaskProperty'], status: 'shipped',
    notes: 'A blocks mask takes 2 of the 8 mask slots and combines by intersect with the other masks. Blocks are squares in comp px; region corners round to whole pixels so block edges stay crisp.' },
  { id: 'masks.track-matte', area: 'masks', name: 'Track mattes',
    description: 'Alpha / luma (inverted) matte from the layer above.', ui: 'Inspector (properties) > Matte dropdown',
    actions: ['editor.setTrackMatte'], status: 'shipped' },

  // effects / adjustment
  { id: 'effects.motion-blur', area: 'effects', name: 'Motion blur',
    description: 'Per-layer motion blur from the layer movement (position, rotation, scale), with a composition shutter angle / phase and sample count. Text animators blur per glyph.',
    ui: 'Select a layer > Inspector > Effects > Motion Blur (per-layer shutter); Toolbar > composition settings > Shutter / MB Samples',
    actions: ['editor.updateLayerProperty', 'editor.setCompositionSetting'], status: 'browser-gated',
    notes: 'Turn on with editor.updateLayerProperty(layerId, "motionBlur", true); optional "motionBlurShutter" (deg, 180 = neutral). Composition: setCompositionSetting("shutterAngle" | "shutterPhase" | "motionBlurSamples", n). The streak itself is drawn by the WebGPU renderer (export uses 16+ samples).' },
  { id: 'effects.layer', area: 'effects', name: 'Shadow, glow, blur and the effect stack',
    description: 'Per-layer drop shadow, glow, blur and a stack of stylize / colour / glitch effects.',
    ui: 'Inspector > Effects tab', actions: ['editor.enableLayerEffect', 'editor.setLayerEffectParam', 'editor.toggleLayerEffect', 'editor.removeLayerEffect'], status: 'browser-gated' },
  { id: 'effects.animated-params', area: 'effects', name: 'Animated glow, shadow, blur and effect params',
    description: 'Keyframe glow intensity / radius / threshold / colour, shadow distance / angle / blur / scale / colour, the layer blur radius / strength / angle (blur-in and blur-out reveals) and any effect-stack param (pixelate size, RGB split, glitch amount, saturation...).',
    ui: 'Agent / MCP: enable the effect (editor.enableLayerEffect / editor.setLayerEffectParam), then editor.addKeyframe or editor.setKeyframes on its path; the keys show in the timeline under "Animated"',
    actions: ['editor.enableLayerEffect', 'editor.setLayerEffectParam', 'editor.setKeyframes', 'editor.addKeyframe'], status: 'shipped',
    notes: `Paths: ${ANIM_FX_PATHS.join(', ')}, effect.<type>.<paramIndex>. A blur radius keyed to 0 drops the blur pass on those frames. Pixel-proven headless by npm run gpu:anim-props.` },
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
    actions: ['editor.addCameraLayer', 'editor.toggleLayer3D', 'editor.cameraMove', 'editor.setKeyframes'], status: 'shipped',
    notes: '2.5D only (no full 3D). Card render proven on the real WebGPU renderer (gpu:camera-cards, B53): rotated / pushed / scaled cards (shape, path shape, precomp), moved two-node and one-node cameras and the painter depth order land within 1 px of the camera3d projection. Card paths (after toggleLayer3D): transform.rotationX, transform.rotationY, transform.rotation (Z), transform.positionZ (+ = away from the camera), keyed with setKeyframes. Camera paths: transform.position (eye x, y), transform.positionZ (eye z), camera.pointOfInterest, camera.pointOfInterestZ, camera.zoom; editor.cameraMove keys a whole beat in one call. Not pixel-proven: camera depth-of-field blur, per-glyph 3D text animators, the in-app camera UI (gizmo, 3D view).' },
  { id: 'effects.corner-pin', area: 'effects', name: 'Corner pin',
    description: 'Pin the four corners of a layer to any four points (keystone, a screen inside a tilted phone, a card leaning in perspective without a camera); each pin keyframable.',
    ui: 'Agent / MCP only for now (no Inspector panel yet)',
    actions: ['editor.setCornerPin', 'editor.setKeyframes'], status: 'shipped',
    notes: 'Reuses the B27 homography (core/tracking/homography.ts) folded into the 2.5D mvp vertex path: exact projective warp, proven within 1 px on shape, text and precomp layers (gpu:camera-cards) + verify:corner-pin. Masks on a pinned layer stay in the unpinned layer space; per-glyph text stamps (text animators) are not pinned.' },

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
    ui: 'Canvas toolbar > Image / Video; drag files onto the canvas; Media Pool', actions: ['agent.importImage', 'agent.importMedia'], status: 'shipped',
    notes: 'Headless: agent.importMedia imports video (MP4, MOV, WebM, MKV), audio (MP3, WAV, M4A, AAC, OGG, FLAC) and images (MCP: import_media {path}, which streams big files in chunks); agent.importImage is the image-only shortcut (MCP: import_image). Place with editor.addVideoFromAsset / editor.addAudioFromAsset / editor.addImageFromAsset.' },
  { id: 'media.place', area: 'media', name: 'Place imported media',
    description: 'Put an imported asset on the canvas and fit it.', ui: 'Drag from the Media Pool',
    actions: ['editor.addImageFromAsset', 'editor.addVideoFromAsset', 'editor.addAudioFromAsset', 'editor.fitLayerToCanvas'], status: 'shipped' },

  // export
  { id: 'export.frame', area: 'export', name: 'Render a frame / contact sheet (PNG)',
    description: 'Full-resolution PNG of one frame, or a labelled contact sheet of several, rendered offscreen through the exporter path (export motion blur, no UI, not the scaled preview).',
    ui: 'Agent / MCP only (render_frame, render_strip). In the app: File > Export Video and step through it.',
    actions: ['agent.renderFrame', 'agent.renderStrip'], status: 'browser-gated',
    notes: 'Needs WebGPU. Proven against the real renderer headless by npm run gpu:anim-props (renderFrame of a frame equals a direct offscreen render).' },
  { id: 'export.video', area: 'export', name: 'Export MP4',
    description: 'Render the composition to MP4 (H.264 + AAC) through WebGPU + WebCodecs.',
    ui: 'File > Export Video... (Ctrl+E)', actions: ['agent.exportMp4'], status: 'browser-gated',
    notes: 'Needs WebGPU + WebCodecs in the tab. agent.exportMp4 runs the same exporter; stream the bytes out with __ffxAgent.readExport.' },
  { id: 'export.project', area: 'export', name: 'Save / download project',
    description: 'Projects autosave to IndexedDB; download as an editable .ffx file and import it back.', ui: 'File > Save (Ctrl+S) / Download Project (.ffx) / Import Project (.ffx)',
    actions: ['agent.saveProject', 'agent.exportProject', 'agent.importProject'], status: 'shipped',
    notes: 'MCP: save_project, export_project {path} writes the .ffx to disk, import_project {path} opens one. The .ffx holds every composition plus imported media, so the agent-built piece stays fully editable in the app.' },

  // templates
  { id: 'templates.animation', area: 'templates', name: 'Animation templates',
    description: 'Pre-built animated scenes: titles, lower thirds, charts, lists, logo pops, UI mockups.',
    ui: 'Media Pool > Templates tab > click a template', actions: ['editor.insertAnimationTemplate'], status: 'shipped' },
  { id: 'templates.cursor', area: 'templates', name: 'Cursor + click rig',
    description: 'A pointer cursor (arrow / hand / I-beam) that moves like a hand (ballistic ease-out along an arc), squashes on clicks with a ripple ring, and swaps icons: for UI demos and product walkthroughs.',
    ui: 'Agent / MCP only (the recursive-editor template uses the same rig)',
    actions: ['agent.addCursor', 'agent.cursorMoveTo', 'agent.cursorClick', 'agent.cursorIcon'], status: 'shipped',
    notes: 'Everything lands as ordinary editable layers and keys: the cursor is a group ("transform.position" = hotspot, "transform.scale" = click squash), the icons are polygon children, each ripple is its own circle layer. Author moves / clicks in time order: a move starts from where the cursor is at its start frame.' },
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
      timing: 'New layers are 4-second clips (outPoint = inPoint + 4 s, capped at the comp length), like the UI. In a longer comp set editor.updateLayerProperty(layerId, "outPoint", durationFrames) or the layer disappears after 4 s.',
      textBox: 'createQuickText / addText make an auto-size text box centred on x (y = the line box centre; to put the visible ink centre or the baseline on y, style the text then call agent.placeText). Layout ignores leading / trailing spaces, so padding a string with spaces does not move it: use x or a fixed box. An auto box is exactly as wide as the text, so horizontalAlign "left" only takes effect with a fixed box: layoutConfig.boundingBox = { type: "fixedWidth", width } and x = left edge + width / 2.',
      shapes: 'addShapeWithDimensions takes the shape CENTRE. New shapes carry a 1 px grey stroke: set "shape.strokeWidth.defaultValue" to 0 for clean fills.',
      colors: 'RGBA arrays with components 0..1, e.g. [1, 0.8, 0.2, 1].',
      scale: 'Scale is a [sx, sy] multiplier: 1 = 100%.',
      runtime: 'In the editor tab: window.__ffxAgent.listFeatures(), .getState(), .run(actionId, args). args is an object keyed by param name or a positional array.',
      undo: 'Actions marked undoable push one normal history command; history.undo reverts it.',
      textStyle: 'Text: font size / line height / letter spacing / stroke width are animatable and live in animOverrides (set path "animOverrides.fontSize.defaultValue", keyframe path "animOverrides.fontSize"). Colour, font family, weight and gradient fill live in "content.spans.0.style.*" (e.g. "content.spans.0.style.color").',
      mcp: 'A local MCP server (mcp/flashfx-mcp.mjs in the repo, npm run mcp:flashfx) drives this runtime over the Chrome DevTools Protocol: list_features, get_state, create_project, run_action(s), seek, play, pause, screenshot, export_mp4, export_project, import_project, import_image, save_project, undo.',
    },
    features: AGENT_FEATURES,
    actions: AGENT_ACTIONS,
  };
}
