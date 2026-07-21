import { create } from 'zustand';
import type { Composition, SceneDocument, Layer, AnimatableProperty, Keyframe, Vec2, InterpolationType, BackgroundLayer, Track, TrackType, VideoPlaybackMode, PathVertex, VertexType, Mask, MaskType, AnchorEdge, PhysicsBindingDef, PhysicsWorldDef, StaggerBindingDef, LayoutObjectLayer, LayoutContainerLayer, ContainerShapeType } from '../core/types';
import { createComposition, createRectangleLayer, createCircleLayer, createStarLayer, createPolygonLayer, createDefaultPolygonVertices, createTextLayer, createVideoLayer, createImageLayer, createAudioLayer, createGroupLayer, createKeyframe, createBackgroundLayer, createMask, createParticleLayer, createAnimationItemLayer, createFieldSampledLayer, createLottieIconLayer, createLayoutObjectLayer, createLayoutContainerLayer, createDefaultChildOverride, uid } from '../core/factory';
import { evaluateVec2, evaluateNumber, buildPhysicsEvaluator } from '../core/interpolation';
import { generatePresetKeyframes, getPresetById, type PresetContext } from '../core/animationPresets';
import { getDescendants } from '../core/sceneGraph';
import { buildPrecompose } from '../core/precompose';
import { createMotionPath } from './motionPath';
import { useHistoryStore, type Command } from './history';
import { mediaAssetManager } from '../engine/media/assetManager';
import { frameScheduler } from '../engine/video/frameScheduler';
import { videoTextureCache } from '../engine/video/videoTextureCache';
import { videoAudioPlayer } from '../engine/video/videoAudioPlayer';
import { PARTICLE_PRESETS } from '../particles/presets';
import { PROCEDURAL_PRESETS } from '../procedural/presets';
import { ANIMATION_ITEM_PRESETS } from '../animation-items/presets';
import { AnchorGraph } from '../anchoring/graph';
import { bakePhysicsWorld, invalidatePhysicsCache } from '../physics/bake';
import { playbackController, useTimelineStore } from './timeline';
import { canParentTo } from '../core/layerSwitches';
import { recomputeCompositionDuration, withMinimumDuration, getMinimumDuration } from '../core/compositionDuration';
import { reflowCompressedTracks, isTrackCompressed } from '../core/trackCompression';
import { clampGroupResizeDelta, applyResizeDelta, type ResizeEdge } from '../core/clipResize';
import { buildCaptionLayers, type CaptionSegment, type CaptionOptions } from '../core/captions';
import { computeExplodeElements, type SplitMode } from '../core/textExplode';
import type { SpeechSegment } from '../core/silenceCutPlan';
import { persistExplodeGroup } from '../engine/textExplodePersistence';
import { useProjectStore } from '../project-system/hooks/useProjectStore';
import { useShapeDefaultsStore } from './shapeDefaults';

/** A selected keyframe resolved to its owning property path + frame (see KeyframeTimeline). */
export interface KeyframeTarget {
  propertyPath: string;
  frame: number;
}

/** Group keyframe targets by property path → set of frames, for batched keyframe edits. */
function groupTargetFrames(targets: KeyframeTarget[]): Map<string, Set<number>> {
  const byPath = new Map<string, Set<number>>();
  for (const t of targets) {
    let set = byPath.get(t.propertyPath);
    if (!set) { set = new Set(); byPath.set(t.propertyPath, set); }
    set.add(t.frame);
  }
  return byPath;
}

interface SelectionState {
  selectedIds: string[];
  activeId: string | null;
  selectedKeyframes: string[];
  selectedCurvePoints: string[];
}

export type SelectionSource = 'canvas' | 'timeline';

interface ClipboardState {
  layers: Layer[];
  withKeyframes: boolean;
  physicsBindings?: PhysicsBindingDef[];
}

// Discriminated intent for committing a clip drag/move. The UI predicts one
// of these during the drag; on pointerup, exactly one is applied as a single
// undoable mutation.
export type CommitClipMoveIntent =
  | { kind: 'sameTrack'; inPoint: number }
  | { kind: 'existingTrack'; trackId: string; inPoint: number }
  | { kind: 'newTrack'; insertOrder: number; inPoint: number }
  | { kind: 'compressedInsert'; trackId: string; insertIndex: number };

function sel(ids: string[], activeId?: string | null): SelectionState {
  return { selectedIds: ids, activeId: activeId ?? (ids.length > 0 ? ids[ids.length - 1] : null), selectedKeyframes: [], selectedCurvePoints: [] };
}

function layerSupportsMasks(layer: Layer): boolean {
  return layer.type === 'shape' || layer.type === 'text' || layer.type === 'video' || layer.type === 'image' || layer.type === 'lottieIcon';
}

const DEFAULT_CLIP_SECONDS = 4;
function defaultClipFrames(comp: Composition): number {
  // Cap to user's minimum duration so newly inserted clips don't auto-extend
  // the timeline just by being added; expansion is reserved for explicit
  // user actions like dragging beyond the current end.
  const cap = getMinimumDuration(comp.settings);
  return Math.min(cap, Math.round(DEFAULT_CLIP_SECONDS * comp.settings.frameRate));
}

export const DEFAULT_PROXY_SCALE = 0.25;

interface EditorState {
  /** The live, actively-edited composition (the mirror of the active registry entry). */
  composition: Composition;
  /** Multi-composition document: resting state of all compositions (precomps + root).
   *  The active entry may be stale — `composition` is authoritative for it; use
   *  `getComposition()` which merges the two. */
  compositions: Record<string, Composition>;
  /** The top-level composition id (what a project opens to). */
  rootCompositionId: string;
  /** Which composition `composition` currently mirrors (root, or a precomp entered). */
  activeCompositionId: string;
  /** Breadcrumb of composition ids from root to the active one (precomp navigation). */
  navStack: string[];
  currentFrame: number;
  isPlaying: boolean;
  selection: SelectionState;
  hoveredLayerId: string | null;
  renamingLayerId: string | null;
  selectionSource: SelectionSource;
  clipboard: ClipboardState | null;
  randomizeColors: boolean;

  // Internal raw setters (used by commands, no history)
  _setComposition: (comp: Composition) => void;
  _setSelection: (sel: SelectionState) => void;

  // Non-undoable actions
  setCurrentFrame: (frame: number) => void;
  setPlaying: (playing: boolean) => void;
  selectLayer: (id: string | null, additive?: boolean, source?: SelectionSource) => void;
  selectKeyframes: (ids: string[], additive?: boolean) => void;
  selectCurvePoints: (ids: string[], additive?: boolean) => void;
  setHoveredLayer: (id: string | null) => void;
  startRenameLayer: (id: string) => void;
  finishRenameLayer: () => void;
  renameLayer: (id: string, name: string) => void;
  resetTransformPosition: (id: string) => void;
  resetTransformScale: (id: string) => void;
  resetTransformRotation: (id: string) => void;
  resetTransformAll: (id: string) => void;
  deselectAll: () => void;
  toggleGroupCollapsed: (groupId: string) => void;
  loadComposition: (comp: Composition) => void;

  // Precomposition (multi-composition document)
  /** Merge lookup: the live active comp for its id, else the registry entry. */
  getComposition: (id: string) => Composition | undefined;
  /** Enter a sub-composition (precomp) for editing; pushes the breadcrumb. */
  enterPrecomp: (compositionId: string) => void;
  /** Go up one level in the breadcrumb. */
  exitPrecomp: () => void;
  /** Jump to a composition by breadcrumb index (0 = root). */
  navigateToComposition: (index: number) => void;
  /** Wrap the current selection into a new sub-composition (undoable). */
  precomposeSelection: () => void;
  /** Rename a composition in the registry (undoable). */
  renameComposition: (id: string, name: string) => void;
  /** The full multi-composition document (folds the live active comp into the registry). */
  getDocument: () => SceneDocument;
  /** Replace the whole document (multi-composition load); resets navigation to root. */
  loadDocument: (doc: SceneDocument) => void;

  // Undoable actions
  addRectangle: () => void;
  addCircle: () => void;
  addStar: () => void;
  addPolygon: () => void;
  addShapeWithDimensions: (
    shapeType: 'rectangle' | 'circle' | 'star' | 'polygon',
    x: number,
    y: number,
    width: number,
    height: number
  ) => void;
  addText: (content?: string) => void;
  addParticleLayer: () => void;
  addFieldSampledLayer: (configJSON?: string) => void;
  addAnimationItem: (presetName: string) => void;
  addLottieIcon: (jsonPath: string, jsonData: string, totalFrames: number, frameRate: number, sourceWidth: number, sourceHeight: number, name: string) => void;
  addLayoutObject: (layoutType: 'hbox' | 'vbox' | 'grid') => void;
  addLayoutContainer: (shapeType?: ContainerShapeType) => void;
  addChildToLayoutContainer: (containerId: string, childId: string) => void;
  removeChildFromLayoutContainer: (containerId: string, childId: string) => void;
  updateLayoutContainer: (containerId: string, updates: Partial<Pick<LayoutContainerLayer, 'distributionMode' | 'spacing' | 'padding' | 'rotationOffset' | 'containerShape'>>) => void;
  addChildToLayout: (layoutId: string, childId: string) => void;
  removeChildFromLayout: (layoutId: string, childId: string) => void;
  reorderLayoutChild: (layoutId: string, childId: string, newIndex: number) => void;
  updateLayoutParams: (layoutId: string, updates: Partial<import('../core/types').LayoutParams>) => void;
  updateChildOverride: (layoutId: string, childId: string, updates: Partial<import('../core/types').ChildLayoutOverride>) => void;
  wrapInLayout: (layerIds: string[], layoutType: 'hbox' | 'vbox' | 'grid') => void;
  unwrapLayout: (layoutId: string) => void;
  addVideo: (file: File, projectId: string, playbackMode?: VideoPlaybackMode) => Promise<void>;
  addImage: (file: File, projectId: string) => Promise<void>;
  addAudio: (file: File, projectId: string) => Promise<void>;
  addAudioFromAsset: (assetId: string) => void;
  addImageFromAsset: (assetId: string, x: number, y: number) => void;
  addVideoFromAsset: (assetId: string, x: number, y: number, playbackMode?: VideoPlaybackMode) => void;
  addCaptionClips: (segments: CaptionSegment[], options: CaptionOptions, clipStartFrame: number) => void;
  stripSilence: (layerId: string, segments: SpeechSegment[]) => string[];
  explodeTextLayer: (layerId: string, splitMode: SplitMode, staggerFrames: number) => void;
  removeLayer: (id: string) => void;
  removeLayers: (ids: string[]) => void;
  updateLayerProperty: (layerId: string, path: string, value: unknown) => void;
  // Image effect-stack actions (see core/effects/effectRegistry). `type` is the
  // frozen numeric effect id; upsert sets one param (creating the effect if
  // absent), remove deletes the whole effect.
  setLayerEffectParam: (layerId: string, type: number, paramIndex: number, value: number, defaults?: number[]) => void;
  removeLayerEffect: (layerId: string, type: number) => void;
  setLayerParent: (childId: string, parentId: string | null) => void;
  addKeyframe: (layerId: string, propertyPath: string, frame: number, value: number | [number, number]) => void;
  /** Delete the keyframes at the given (propertyPath, frame) targets (undoable, batched). */
  deleteKeyframes: (layerId: string, targets: KeyframeTarget[]) => void;
  /** Set interpolation (and optional bezier handles) on the given keyframe targets (undoable, batched). */
  setKeyframeInterpolation: (layerId: string, targets: KeyframeTarget[], interpolation: InterpolationType, handleIn?: Vec2, handleOut?: Vec2) => void;
  applyAnimationPreset: (layerId: string, presetId: string) => void;
  applyAnimationPresetBatch: (layerIds: string[], presetId: string, durationSeconds: number, atStart: boolean) => void;
  setCompositionSetting: (key: string, value: number) => void;
  createGroup: () => void;
  ungroupSelection: () => void;

  // Clipboard (copy / paste / duplicate)
  copySelection: () => void;
  pasteClipboard: () => void;
  duplicateSelection: () => void;
  toggleRandomizeColors: () => void;

  // Motion path actions
  addMotionPath: (layerId: string) => void;
  removeMotionPath: (pathId: string) => void;
  updateMotionPath: (pathId: string, updates: Partial<import('../core/types').MotionPath>) => void;

  // Procedural loop actions
  addProceduralBinding: (layerId: string, presetName: string) => void;
  removeProceduralBinding: (bindingId: string) => void;
  updateProceduralBinding: (bindingId: string, updates: Partial<import('../core/types').ProceduralBinding>) => void;

  // Anchor edge actions
  addAnchorEdge: (sourceLayerId: string, targetLayerId: string) => void;
  removeAnchorEdge: (edgeId: string) => void;
  updateAnchorEdge: (edgeId: string, updates: Partial<import('../core/types').AnchorEdge>) => void;

  // Physics actions
  addPhysicsBinding: (layerId: string, role: import('../core/types').PhysicsRoleDef) => void;
  removePhysicsBinding: (bindingId: string) => void;
  updatePhysicsBinding: (bindingId: string, updates: Partial<PhysicsBindingDef>) => void;
  updatePhysicsWorld: (updates: Partial<PhysicsWorldDef>) => void;
  bakePhysics: () => Promise<void>;
  physicsBakeStatus: 'idle' | 'baking' | 'done' | 'stale';
  physicsBakeProgress: number;

  // Stagger actions
  addStaggerBinding: (targetLayerIds: string[], config: StaggerBindingDef) => void;
  removeStaggerBinding: (bindingId: string) => void;
  updateStaggerBinding: (bindingId: string, updates: Partial<StaggerBindingDef>) => void;
  applyStaggerOffsets: (bindingId: string, offsets: Map<string, number>) => void;

  // Mask actions
  addMask: (layerId: string, type: MaskType) => void;
  removeMask: (layerId: string, maskId: string) => void;
  updateMaskProperty: (layerId: string, maskId: string, path: string, value: unknown) => void;
  addMaskKeyframe: (layerId: string, maskId: string, propertyPath: string, frame: number, value: number | [number, number]) => void;
  duplicateMask: (layerId: string, maskId: string) => void;
  reorderMask: (layerId: string, maskId: string, direction: 'up' | 'down') => void;

  // Background actions (undoable)
  addBackgroundLayer: () => void;
  removeBackgroundLayer: (id: string) => void;
  updateBackgroundLayer: (id: string, updates: Partial<BackgroundLayer>) => void;
  reorderBackgroundLayer: (id: string, direction: 'up' | 'down') => void;

  // Layer reordering (undoable)
  reorderLayers: (sourceIds: string[], targetIndex: number) => void;

  // Track operations
  moveClipInTime: (layerId: string, newInPoint: number) => void;
  moveClipToTrack: (layerId: string, targetTrackId: string, newInPoint?: number) => void;
  reorderClipToTrackPosition: (layerId: string, targetOrder: number, newInPoint?: number) => void;
  resizeClips: (layerIds: string[], edge: ResizeEdge, delta: number) => void;
  canPlaceOnTrack: (layerId: string, trackId: string, inPoint: number, outPoint: number) => boolean;

  // Premiere-style canonical clip-move action. Single history entry, prunes
  // empty tracks, recomputes timeline duration. The timeline UI uses this
  // for every drag commit; older move-* helpers remain for trim & legacy use.
  commitClipMove: (layerId: string, intent: CommitClipMoveIntent) => void;

  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;

  // Toggle CapCut-style gapless compression on a track. Recalculates the
  // gapless layout immediately when enabled; leaves clips in place (now freely
  // positionable) when disabled.
  toggleTrackCompression: (trackId: string) => void;

  // Trim operations
  trimSplit: (layerId?: string) => void;
  trimLeft: (layerId?: string) => void;
  trimRight: (layerId?: string) => void;
  trimCutUp: (layerId?: string) => void;
  trimCutDown: (layerId?: string) => void;

  // Batch extend operations
  extendToMaxLeft: () => void;
  extendToMaxRight: () => void;

  // Reorder clips in time — ascending = earliest inPoint first (matching layer stack top-to-bottom)
  orderClipsAscending: () => void;
  orderClipsDescending: () => void;

  // Commit a drag as a single undo step (called on drag end)
  commitDrag: (label: string, oldComp: Composition, oldSel: SelectionState) => void;

  // Vector path actions
  createPenPath: (vertices: PathVertex[], closed: boolean) => string;
  setPathVerticesLive: (layerId: string, vertices: PathVertex[], closed?: boolean) => void;
  addPathPoint: (layerId: string, segmentIndex: number, t: number) => void;
  deletePathPoint: (layerId: string, vertexIndex: number) => void;
  setPathVertexType: (layerId: string, vertexIndex: number, type: VertexType) => void;
}

function getDefaultComposition(): Composition {
  return createComposition('Untitled', {
    width: 1920,
    height: 1080,
    frameRate: 30,
    durationFrames: 150,
    backgroundColor: [0.08, 0.09, 0.12, 1],
  });
}

function layerTypeToTrackType(type: Layer['type']): TrackType {
  switch (type) {
    case 'video': return 'video';
    case 'image': return 'image';
    case 'text': return 'text';
    case 'shape': return 'shape';
    case 'group': return 'group';
    case 'audio': return 'audio';
    case 'particle': return 'particle';
    case 'animationItem': return 'animationItem';
    case 'fieldSampled': return 'fieldSampled';
    case 'lottieIcon': return 'lottieIcon';
    case 'cloner': return 'cloner';
    case 'precomp': return 'precomp';
    default: return 'mixed';
  }
}

function createTrack(name: string, type: TrackType, order: number): Track {
  return { id: uid(), name, type, order, locked: false, visible: true, compressed: type === 'video' };
}

// Deep-clone an AnimatableProperty for an exploded clip. Keyframe frames are
// rigidly shifted by `frameShift` (the stagger cascade); a vec2 `delta` is
// added to both the default value and every keyframe value (the position
// offset that re-seats the clip at its original on-screen spot).
function cloneAnimProperty(
  prop: AnimatableProperty,
  frameShift: number,
  delta?: Vec2,
): AnimatableProperty {
  const offsetVec = (v: number | Vec2): number | Vec2 => {
    if (!Array.isArray(v)) return v;
    return delta ? [v[0] + delta[0], v[1] + delta[1]] : [v[0], v[1]];
  };
  return {
    id: uid(),
    name: prop.name,
    valueType: prop.valueType,
    defaultValue: offsetVec(prop.defaultValue),
    keyframes: prop.keyframes.map((kf) => ({
      frame: kf.frame + frameShift,
      value: offsetVec(kf.value),
      interpolation: kf.interpolation,
      handleIn: [kf.handleIn[0], kf.handleIn[1]] as Vec2,
      handleOut: [kf.handleOut[0], kf.handleOut[1]] as Vec2,
    })),
  };
}

// Build one exploded text clip from the source layer: identical transform and
// style (animation copied verbatim, only time-shifted) with the position
// nudged by (deltaX, deltaY) so glyphs stay exactly where they were.
function cloneTextLayerForExplode(
  source: import('../core/types').TextLayer,
  deltaX: number,
  deltaY: number,
  frameShift: number,
): import('../core/types').TextLayer {
  const t = source.transform;
  const delta: Vec2 = [deltaX, deltaY];
  return {
    id: uid(),
    type: 'text',
    name: source.name,
    parentId: source.parentId,
    trackId: null,
    visible: source.visible,
    locked: false,
    effectsEnabled: source.effectsEnabled,
    motionBlur: source.motionBlur,
    is3D: source.is3D,
    blendMode: source.blendMode,
    transform: {
      position: cloneAnimProperty(t.position, frameShift, delta),
      rotation: cloneAnimProperty(t.rotation, frameShift),
      scale: cloneAnimProperty(t.scale, frameShift),
      anchorPoint: cloneAnimProperty(t.anchorPoint, frameShift),
      opacity: cloneAnimProperty(t.opacity, frameShift),
    },
    content: { spans: source.content.spans.map((s) => ({ text: s.text, style: { ...s.style, color: [...s.style.color] as import('../core/types').Vec4, strokeColor: [...s.style.strokeColor] as import('../core/types').Vec4 } })) },
    layoutConfig: { ...source.layoutConfig, boundingBox: { ...source.layoutConfig.boundingBox } as any },
    animOverrides: {
      fontSize: cloneAnimProperty(source.animOverrides.fontSize, frameShift),
      letterSpacing: cloneAnimProperty(source.animOverrides.letterSpacing, frameShift),
      lineHeight: cloneAnimProperty(source.animOverrides.lineHeight, frameShift),
      strokeWidth: cloneAnimProperty(source.animOverrides.strokeWidth, frameShift),
    },
    inPoint: source.inPoint + frameShift,
    outPoint: source.outPoint + frameShift,
  };
}


function ensureLayerHasTrack(composition: Composition, layer: Layer): Composition {
  if (layer.trackId) return composition;
  const trackType = layerTypeToTrackType(layer.type);

  // Premiere-style: try to drop the new clip onto an existing same-type track
  // first; only create a new track when none has open space at this time range.
  const fitId = findFirstFit(
    composition.layers,
    composition.tracks,
    layer.type,
    layer.inPoint,
    layer.outPoint,
    layer.id,
  );
  if (fitId) {
    return {
      ...composition,
      layers: composition.layers.map((l) => l.id === layer.id ? { ...l, trackId: fitId } : l),
    };
  }

  // Audio tracks must always be placed below visual tracks
  let order: number;
  if (trackType === 'audio') {
    const maxOrder = composition.tracks.reduce((m, t) => Math.max(m, t.order), -1);
    order = maxOrder + 1;
  } else {
    // New visual clips always go to the TOP — shift all existing tracks down
    const minVisualOrder = composition.tracks
      .filter((t) => t.type !== 'audio')
      .reduce((m, t) => Math.min(m, t.order), 0);
    order = minVisualOrder - 1;
  }

  const track = createTrack(`${layer.type} track`, trackType, order);
  const updatedLayer = { ...layer, trackId: track.id };
  return {
    ...composition,
    tracks: [...composition.tracks, track],
    layers: composition.layers.map((l) => l.id === layer.id ? updatedLayer : l),
  };
}

function clipsOverlap(a: { inPoint: number; outPoint: number }, b: { inPoint: number; outPoint: number }): boolean {
  return a.inPoint < b.outPoint && a.outPoint > b.inPoint;
}

function canPlaceClipOnTrack(
  layers: Layer[],
  trackId: string,
  clipId: string,
  inPoint: number,
  outPoint: number
): boolean {
  const trackClips = layers.filter((l) => l.trackId === trackId && l.id !== clipId);
  for (const clip of trackClips) {
    if (clipsOverlap({ inPoint, outPoint }, { inPoint: clip.inPoint, outPoint: clip.outPoint })) {
      return false;
    }
  }
  return true;
}

// Tracks of these types can host the layer type without coercion.
function trackAcceptsLayerType(trackType: TrackType, layerType: Layer['type']): boolean {
  if (trackType === 'mixed') return true;
  return trackType === layerTypeToTrackType(layerType);
}

// Find the first track of a compatible type with no overlap at the requested
// time range. Visual layers never collapse onto audio tracks (and vice versa)
// because trackAcceptsLayerType keeps audio segregated.
function findFirstFit(
  layers: Layer[],
  tracks: Track[],
  layerType: Layer['type'],
  inPoint: number,
  outPoint: number,
  excludeLayerId: string = ''
): string | null {
  const candidates = [...tracks]
    .filter((t) => trackAcceptsLayerType(t.type, layerType))
    .sort((a, b) => a.order - b.order);
  for (const track of candidates) {
    if (canPlaceClipOnTrack(layers, track.id, excludeLayerId, inPoint, outPoint)) {
      return track.id;
    }
  }
  return null;
}

// Drop tracks that no longer reference any layer and renormalize order indices
// to consecutive integers. Visual tracks keep their relative order before
// audio tracks (audio is always rendered last / lowest, i.e. highest order).
function pruneEmptyTracks(composition: Composition): Composition {
  const usedIds = new Set(composition.layers.map((l) => l.trackId).filter(Boolean) as string[]);
  const survivors = composition.tracks.filter((t) => usedIds.has(t.id));

  const visual = survivors
    .filter((t) => t.type !== 'audio')
    .sort((a, b) => a.order - b.order);
  const audio = survivors
    .filter((t) => t.type === 'audio')
    .sort((a, b) => a.order - b.order);

  const ordered = [...visual, ...audio];
  const renumbered = ordered.map((t, i) => (t.order === i ? t : { ...t, order: i }));

  // Bail out without an allocation when nothing changed.
  if (renumbered.length === composition.tracks.length) {
    let identical = true;
    for (let i = 0; i < renumbered.length; i++) {
      if (renumbered[i] !== composition.tracks[i]) { identical = false; break; }
    }
    if (identical) return composition;
  }
  return { ...composition, tracks: renumbered };
}

// Apply both timeline duration recompute and empty-track pruning. Used by
// every layer-mutating action so that downstream state never sees stale
// tracks or stale duration.
function settleComposition(composition: Composition): Composition {
  let settled = recomputeCompositionDuration(reflowCompressedTracks(pruneEmptyTracks(composition)));
  if (settled.proceduralBindings?.length) {
    const layerIds = new Set(settled.layers.map((l) => l.id));
    const cleaned = settled.proceduralBindings.filter((b) => layerIds.has(b.layerId));
    if (cleaned.length !== settled.proceduralBindings.length) {
      settled = { ...settled, proceduralBindings: cleaned };
    }
  }
  if (settled.anchorEdges?.length) {
    const layerIds = new Set(settled.layers.map((l) => l.id));
    const cleaned = settled.anchorEdges.filter(
      (e) => layerIds.has(e.sourceLayerId) && layerIds.has(e.targetLayerId)
    );
    if (cleaned.length !== settled.anchorEdges.length) {
      settled = { ...settled, anchorEdges: cleaned };
    }
  }
  if (settled.physicsBindings?.length) {
    const layerIds = new Set(settled.layers.map((l) => l.id));
    const cleaned = settled.physicsBindings.filter((b) => layerIds.has(b.layerId));
    if (cleaned.length !== settled.physicsBindings.length) {
      settled = { ...settled, physicsBindings: cleaned };
    }
  }
  return settled;
}

type TrimMode = 'split' | 'left' | 'right' | 'cutUp' | 'cutDown';

interface TrimResult {
  newComp: Composition;
  selectId: string;
}

function executeTrim(
  composition: Composition,
  layerId: string,
  playheadFrame: number,
  mode: TrimMode
): TrimResult | null {
  const layer = composition.layers.find((l) => l.id === layerId);
  if (!layer) return null;
  if (playheadFrame <= layer.inPoint || playheadFrame >= layer.outPoint) return null;

  const originalIn = layer.inPoint;
  const originalOut = layer.outPoint;

  if (mode === 'left') {
    const newLayers = composition.layers.map((l) =>
      l.id === layerId ? { ...l, inPoint: playheadFrame } : l
    );
    return { newComp: { ...composition, layers: newLayers }, selectId: layerId };
  }

  if (mode === 'right') {
    const newLayers = composition.layers.map((l) =>
      l.id === layerId ? { ...l, outPoint: playheadFrame } : l
    );
    return { newComp: { ...composition, layers: newLayers }, selectId: layerId };
  }

  // split, cutUp, cutDown all create two clips
  const clipA = { ...layer, outPoint: playheadFrame };
  const clipB: Layer = { ...JSON.parse(JSON.stringify(layer)), id: uid(), inPoint: playheadFrame, outPoint: originalOut };

  // The two halves together must render exactly what the original did. For
  // media clips, source time 0 aligns with (inPoint - startOffset), so pushing
  // clipB's inPoint forward to the playhead requires the same push on its
  // startOffset — otherwise the right-hand half replays the source from the
  // original clip's start. Comp frames, matching resolveVideoLayer/stripSilence.
  const splitDelta = playheadFrame - originalIn;
  if (clipB.type === 'video') {
    clipB.video.startOffset += splitDelta;
  } else if (clipB.type === 'audio') {
    clipB.audio.startOffset += splitDelta;
  }

  let newTracks = composition.tracks;

  if (mode === 'cutUp') {
    const sortedTracks = [...composition.tracks].sort((a, b) => a.order - b.order);
    const currentTrackIdx = sortedTracks.findIndex((t) => t.id === layer.trackId);
    let targetTrack: Track | null = null;
    for (let i = currentTrackIdx - 1; i >= 0; i--) {
      if (canPlaceClipOnTrack(composition.layers, sortedTracks[i].id, '', playheadFrame, originalOut)) {
        targetTrack = sortedTracks[i];
        break;
      }
    }
    if (!targetTrack) {
      const minOrder = sortedTracks.length > 0 ? sortedTracks[0].order : 0;
      targetTrack = createTrack(`${layer.type} track`, layerTypeToTrackType(layer.type), minOrder - 1);
      newTracks = [...composition.tracks, targetTrack];
    }
    clipB.trackId = targetTrack.id;
  } else if (mode === 'cutDown') {
    const sortedTracks = [...composition.tracks].sort((a, b) => a.order - b.order);
    const currentTrackIdx = sortedTracks.findIndex((t) => t.id === layer.trackId);
    let targetTrack: Track | null = null;
    for (let i = currentTrackIdx + 1; i < sortedTracks.length; i++) {
      if (canPlaceClipOnTrack(composition.layers, sortedTracks[i].id, '', playheadFrame, originalOut)) {
        targetTrack = sortedTracks[i];
        break;
      }
    }
    if (!targetTrack) {
      const maxOrder = sortedTracks.length > 0 ? sortedTracks[sortedTracks.length - 1].order : 0;
      targetTrack = createTrack(`${layer.type} track`, layerTypeToTrackType(layer.type), maxOrder + 1);
      newTracks = [...composition.tracks, targetTrack];
    }
    clipB.trackId = targetTrack.id;
  }

  const newLayers = composition.layers.map((l) => l.id === layerId ? clipA : l);
  newLayers.push(clipB);
  return { newComp: { ...composition, tracks: newTracks, layers: newLayers }, selectId: clipA.id };
}

function exec(cmd: Command) {
  useHistoryStore.getState().execute(cmd);
}

// ─── Clipboard / duplication helpers ───

function isAnimatableProperty(o: Record<string, unknown>): boolean {
  return typeof o.id === 'string' && Array.isArray(o.keyframes) && typeof o.valueType === 'string';
}

// Walk a cloned layer and, for every AnimatableProperty, assign a fresh id so a
// pasted copy never shares property/keyframe identity with its source. When
// `bakeFrame` is provided, keyframes are collapsed to their evaluated value at
// that frame (used for canvas copies: "current settings, without keyframes").
function processAnimatables(node: unknown, bakeFrame: number | null): void {
  if (Array.isArray(node)) {
    for (const item of node) processAnimatables(item, bakeFrame);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  if (isAnimatableProperty(o)) {
    const prop = o as unknown as AnimatableProperty;
    prop.id = uid();
    if (bakeFrame !== null && prop.keyframes.length > 0) {
      prop.defaultValue =
        prop.valueType === 'vec2' ? evaluateVec2(prop, bakeFrame) : evaluateNumber(prop, bakeFrame);
      prop.keyframes = [];
    }
  }
  for (const key of Object.keys(o)) processAnimatables(o[key], bakeFrame);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function randomFillColor(): [number, number, number, number] {
  const [r, g, b] = hslToRgb(Math.random(), 0.65, 0.55);
  return [r, g, b, 1];
}

function applyRandomFill(layer: Layer): void {
  if (layer.type === 'shape') {
    layer.shape.fillColor = randomFillColor();
  } else if (layer.type === 'text') {
    if (layer.content.spans.length > 0) {
      layer.content.spans[0].style.color = randomFillColor();
    }
  }
}

function offsetLayerPosition(layer: Layer, dx: number, dy: number): void {
  const pos = layer.transform.position;
  const dv = pos.defaultValue as Vec2;
  pos.defaultValue = [dv[0] + dx, dv[1] + dy];
  if (pos.keyframes.length > 0) {
    pos.keyframes = pos.keyframes.map((k) => {
      const v = k.value as Vec2;
      return { ...k, value: [v[0] + dx, v[1] + dy] as Vec2 };
    });
  }
}

// Turn a copied source layer into a ready-to-insert clone: deep copy, fresh
// ids, optional keyframe baking, a visible offset, a "copy" suffix, and an
// optional randomized fill.
function instantiatePastedLayer(
  source: Layer,
  opts: { bakeFrame: number | null; randomize: boolean },
): Layer {
  const clone = JSON.parse(JSON.stringify(source)) as Layer;
  clone.id = uid();
  clone.parentId = null;
  clone.trackId = null;
  clone.name = `${clone.name} copy`;
  processAnimatables(clone, opts.bakeFrame);
  offsetLayerPosition(clone, 20, 20);
  if (opts.randomize) applyRandomFill(clone);
  return clone;
}

let autoBakeTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleAutoBake() {
  if (autoBakeTimer) clearTimeout(autoBakeTimer);
  autoBakeTimer = setTimeout(() => {
    autoBakeTimer = null;
    const store = useEditorStore.getState();
    if (store.physicsBakeStatus !== 'baking') {
      store.bakePhysics().catch(() => {});
    }
  }, 300);
}

const _initialRoot = getDefaultComposition();

export const useEditorStore = create<EditorState>((set, get) => ({
  composition: _initialRoot,
  compositions: { [_initialRoot.id]: _initialRoot },
  rootCompositionId: _initialRoot.id,
  activeCompositionId: _initialRoot.id,
  navStack: [_initialRoot.id],
  currentFrame: 0,
  isPlaying: false,
  selection: { selectedIds: [], activeId: null, selectedKeyframes: [], selectedCurvePoints: [] },
  hoveredLayerId: null,
  renamingLayerId: null,
  selectionSource: 'canvas',
  clipboard: null,
  randomizeColors: false,
  physicsBakeStatus: 'idle',
  physicsBakeProgress: 0,

  _setComposition: (comp) => set({ composition: settleComposition(comp) }),
  _setSelection: (sel) => set({ selection: sel }),

  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setPlaying: (playing) => set({ isPlaying: playing }),

  selectLayer: (id, additive = false, source) => {
    if (source) set({ selectionSource: source });
    if (id === null) {
      set({ selection: { selectedIds: [], activeId: null, selectedKeyframes: [], selectedCurvePoints: [] } });
      return;
    }
    const { selection } = get();
    if (additive) {
      const alreadySelected = selection.selectedIds.includes(id);
      if (alreadySelected) {
        const newIds = selection.selectedIds.filter((sid) => sid !== id);
        set({ selection: { ...selection, selectedIds: newIds, activeId: newIds.length > 0 ? newIds[newIds.length - 1] : null } });
      } else {
        set({ selection: { ...selection, selectedIds: [...selection.selectedIds, id], activeId: id } });
      }
    } else {
      set({ selection: { selectedIds: [id], activeId: id, selectedKeyframes: [], selectedCurvePoints: [] } });
    }
  },

  selectKeyframes: (ids, additive = false) => {
    const { selection } = get();
    if (additive) {
      const combined = new Set([...selection.selectedKeyframes, ...ids]);
      set({ selection: { ...selection, selectedKeyframes: [...combined] } });
    } else {
      set({ selection: { ...selection, selectedKeyframes: ids } });
    }
  },

  selectCurvePoints: (ids, additive = false) => {
    const { selection } = get();
    if (additive) {
      const combined = new Set([...selection.selectedCurvePoints, ...ids]);
      set({ selection: { ...selection, selectedCurvePoints: [...combined] } });
    } else {
      set({ selection: { ...selection, selectedCurvePoints: ids } });
    }
  },

  deselectAll: () => set({ selection: { selectedIds: [], activeId: null, selectedKeyframes: [], selectedCurvePoints: [] } }),
  setHoveredLayer: (id) => set({ hoveredLayerId: id }),
  startRenameLayer: (id) => set({ renamingLayerId: id }),
  finishRenameLayer: () => set({ renamingLayerId: null }),

  renameLayer: (id, name) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === id);
    if (!layer || layer.name === name) { set({ renamingLayerId: null }); return; }
    const oldComp = composition;
    const newLayers = composition.layers.map((l) => l.id === id ? { ...l, name } as Layer : l);
    const newComp = { ...composition, layers: newLayers };
    exec({
      label: 'Rename Layer',
      execute: () => { set({ composition: newComp, renamingLayerId: null }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  resetTransformPosition: (id) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === id);
    if (!layer) return;
    const oldComp = composition;
    const newLayers = composition.layers.map((l) => {
      if (l.id !== id) return l;
      const pos = { ...l.transform.position, defaultValue: [0, 0] as Vec2 };
      return { ...l, transform: { ...l.transform, position: pos } } as Layer;
    });
    const newComp = { ...composition, layers: newLayers };
    exec({
      label: 'Reset Position',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  resetTransformScale: (id) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === id);
    if (!layer) return;
    const oldComp = composition;
    const newLayers = composition.layers.map((l) => {
      if (l.id !== id) return l;
      const scale = { ...l.transform.scale, defaultValue: [1, 1] as Vec2 };
      return { ...l, transform: { ...l.transform, scale } } as Layer;
    });
    const newComp = { ...composition, layers: newLayers };
    exec({
      label: 'Reset Scale',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  resetTransformRotation: (id) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === id);
    if (!layer) return;
    const oldComp = composition;
    const newLayers = composition.layers.map((l) => {
      if (l.id !== id) return l;
      const rotation = { ...l.transform.rotation, defaultValue: 0 };
      return { ...l, transform: { ...l.transform, rotation } } as Layer;
    });
    const newComp = { ...composition, layers: newLayers };
    exec({
      label: 'Reset Rotation',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  resetTransformAll: (id) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === id);
    if (!layer) return;
    const oldComp = composition;
    const newLayers = composition.layers.map((l) => {
      if (l.id !== id) return l;
      const position = { ...l.transform.position, defaultValue: [0, 0] as Vec2 };
      const scale = { ...l.transform.scale, defaultValue: [1, 1] as Vec2 };
      const rotation = { ...l.transform.rotation, defaultValue: 0 };
      return { ...l, transform: { ...l.transform, position, scale, rotation } } as Layer;
    });
    const newComp = { ...composition, layers: newLayers };
    exec({
      label: 'Reset All Transforms',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  loadComposition: (comp) => {
    useHistoryStore.getState().clear();
    let migrated = { ...comp, tracks: comp.tracks ?? [] };
    // Migrate legacy compositions: assign tracks to trackless layers
    for (const layer of migrated.layers) {
      if (!layer.trackId) {
        migrated = ensureLayerHasTrack(migrated, layer);
      }
    }
    migrated = settleComposition(migrated);
    set({
      composition: migrated,
      compositions: { [migrated.id]: migrated },
      rootCompositionId: migrated.id,
      activeCompositionId: migrated.id,
      navStack: [migrated.id],
      currentFrame: 0,
      isPlaying: false,
      selection: { selectedIds: [], activeId: null, selectedKeyframes: [], selectedCurvePoints: [] },
      hoveredLayerId: null,
      renamingLayerId: null,
    });
  },

  getComposition: (id) => {
    const { activeCompositionId, composition, compositions } = get();
    return id === activeCompositionId ? composition : compositions[id];
  },

  enterPrecomp: (compositionId) => {
    const { composition, compositions, activeCompositionId, navStack } = get();
    if (compositionId === activeCompositionId) return;
    const target = compositions[compositionId];
    if (!target) return;
    set({
      // Fold the live active comp back into the registry, then swap.
      compositions: { ...compositions, [activeCompositionId]: composition },
      composition: target,
      activeCompositionId: compositionId,
      navStack: [...navStack, compositionId],
      currentFrame: 0,
      selection: { selectedIds: [], activeId: null, selectedKeyframes: [], selectedCurvePoints: [] },
    });
  },

  exitPrecomp: () => {
    const { navStack } = get();
    if (navStack.length <= 1) return;
    get().navigateToComposition(navStack.length - 2);
  },

  navigateToComposition: (index) => {
    const { composition, compositions, activeCompositionId, navStack } = get();
    if (index < 0 || index >= navStack.length) return;
    const targetId = navStack[index];
    if (targetId === activeCompositionId) return;
    const folded = { ...compositions, [activeCompositionId]: composition };
    const target = folded[targetId];
    if (!target) return;
    set({
      compositions: folded,
      composition: target,
      activeCompositionId: targetId,
      navStack: navStack.slice(0, index + 1),
      currentFrame: 0,
      selection: { selectedIds: [], activeId: null, selectedKeyframes: [], selectedCurvePoints: [] },
    });
  },

  precomposeSelection: () => {
    const { composition, compositions, selection } = get();
    const built = buildPrecompose(composition, selection.selectedIds, `Precomp ${Object.keys(compositions).length}`);
    if (!built) return;
    const oldComp = composition;
    const oldSel = selection;
    const oldRegistry = compositions;
    // Give the sub-comp's layers tracks + settle both comps (reuse store helpers).
    let sub = built.subComposition;
    for (const l of built.subComposition.layers) sub = ensureLayerHasTrack(sub, l);
    sub = settleComposition(sub);
    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: built.parentLayers }, built.precompLayer));
    const newRegistry = { ...compositions, [sub.id]: sub };
    const newSel: SelectionState = sel([built.precompLayer.id], built.precompLayer.id);
    exec({
      label: 'Precompose',
      execute: () => { set({ composition: newComp, compositions: newRegistry, selection: newSel }); },
      undo: () => { set({ composition: oldComp, compositions: oldRegistry, selection: oldSel }); },
    });
  },

  renameComposition: (id, name) => {
    const { composition, compositions, activeCompositionId } = get();
    const isActive = id === activeCompositionId;
    const current = isActive ? composition : compositions[id];
    if (!current) return;
    const oldComp = composition;
    const oldRegistry = compositions;
    const renamed = { ...current, name };
    const newComp = isActive ? renamed : composition;
    const newRegistry = { ...compositions, [id]: renamed };
    exec({
      label: 'Rename Composition',
      execute: () => { set({ composition: newComp, compositions: newRegistry }); },
      undo: () => { set({ composition: oldComp, compositions: oldRegistry }); },
    });
  },

  getDocument: () => {
    const { compositions, activeCompositionId, composition, rootCompositionId } = get();
    // Fold the live active comp into the registry so the document is complete.
    return { version: 2, rootCompositionId, compositions: { ...compositions, [activeCompositionId]: composition } };
  },

  loadDocument: (doc) => {
    useHistoryStore.getState().clear();
    const compositions: Record<string, Composition> = {};
    for (const id of Object.keys(doc.compositions)) {
      let c: Composition = { ...doc.compositions[id], tracks: doc.compositions[id].tracks ?? [] };
      for (const layer of c.layers) if (!layer.trackId) c = ensureLayerHasTrack(c, layer);
      compositions[id] = settleComposition(c);
    }
    const ids = Object.keys(compositions);
    if (ids.length === 0) return;
    const rootId = doc.rootCompositionId && compositions[doc.rootCompositionId] ? doc.rootCompositionId : ids[0];
    set({
      compositions,
      composition: compositions[rootId],
      rootCompositionId: rootId,
      activeCompositionId: rootId,
      navStack: [rootId],
      currentFrame: 0,
      isPlaying: false,
      selection: { selectedIds: [], activeId: null, selectedKeyframes: [], selectedCurvePoints: [] },
      hoveredLayerId: null,
      renamingLayerId: null,
    });
  },

  toggleGroupCollapsed: (groupId) => {
    const { composition } = get();
    const layers = composition.layers.map((layer) => {
      if (layer.id !== groupId || layer.type !== 'group') return layer;
      return { ...layer, collapsed: !layer.collapsed };
    });
    set({ composition: { ...composition, layers } });
  },

  addRectangle: () => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const color = useShapeDefaultsStore.getState().fillColor;
    const x = 200 + (composition.layers.length * 80) % 600;
    const y = 150 + (composition.layers.length * 60) % 400;

    const layer = createRectangleLayer(
      `Rectangle ${composition.layers.length + 1}`,
      x, y, 200, 150, color,
      defaultClipFrames(composition)
    );

    const newComp = settleComposition(ensureLayerHasTrack(
      { ...composition, layers: [...composition.layers, layer] },
      layer
    ));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Rectangle',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addCircle: () => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const color = useShapeDefaultsStore.getState().fillColor;
    const x = 300 + (composition.layers.length * 90) % 500;
    const y = 200 + (composition.layers.length * 70) % 350;
    const circleCount = composition.layers.filter((l) => l.type === 'shape' && l.shape.type === 'circle').length;

    const layer = createCircleLayer(
      `Circle ${circleCount + 1}`,
      x, y, 80, color,
      defaultClipFrames(composition)
    );

    const newComp = settleComposition(ensureLayerHasTrack(
      { ...composition, layers: [...composition.layers, layer] },
      layer
    ));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Circle',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addStar: () => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const color = useShapeDefaultsStore.getState().fillColor;
    const x = 400 + (composition.layers.length * 70) % 500;
    const y = 250 + (composition.layers.length * 60) % 300;
    const starCount = composition.layers.filter((l) => l.type === 'shape' && l.shape.type === 'star').length;

    const layer = createStarLayer(
      `Star ${starCount + 1}`,
      x, y, 5, 80, 35, color,
      defaultClipFrames(composition)
    );

    const newComp = settleComposition(ensureLayerHasTrack(
      { ...composition, layers: [...composition.layers, layer] },
      layer
    ));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Star',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addPolygon: () => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const color = useShapeDefaultsStore.getState().fillColor;
    const x = 350 + (composition.layers.length * 80) % 500;
    const y = 300 + (composition.layers.length * 50) % 300;
    const polyCount = composition.layers.filter((l) => l.type === 'shape' && l.shape.type === 'polygon').length;

    const layer = createPolygonLayer(
      `Polygon ${polyCount + 1}`,
      x, y, createDefaultPolygonVertices(), true, color,
      defaultClipFrames(composition)
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Polygon',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addShapeWithDimensions: (shapeType, x, y, width, height) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const { fillColor, strokeColor } = useShapeDefaultsStore.getState();

    let layer: Layer;
    if (shapeType === 'rectangle') {
      const count = composition.layers.filter((l) => l.type === 'shape' && l.shape.type === 'rectangle').length;
      layer = createRectangleLayer(
        `Rectangle ${count + 1}`,
        x, y, width, height, fillColor,
        defaultClipFrames(composition)
      );
      // Override neutral stroke
      if (layer.type === 'shape' && layer.shape.type === 'rectangle') {
        layer.shape.strokeColor = strokeColor;
        layer.shape.strokeWidth.defaultValue = 1;
      }
    } else if (shapeType === 'circle') {
      const count = composition.layers.filter((l) => l.type === 'shape' && l.shape.type === 'circle').length;
      const radius = Math.max(1, Math.min(width, height) / 2);
      layer = createCircleLayer(
        `Ellipse ${count + 1}`,
        x, y, radius, fillColor,
        defaultClipFrames(composition)
      );
      if (layer.type === 'shape' && layer.shape.type === 'circle') {
        layer.shape.strokeColor = strokeColor;
        layer.shape.strokeWidth.defaultValue = 1;
      }
    } else if (shapeType === 'star') {
      const count = composition.layers.filter((l) => l.type === 'shape' && l.shape.type === 'star').length;
      const outer = Math.max(2, Math.min(width, height) / 2);
      const inner = outer * 0.4;
      layer = createStarLayer(
        `Star ${count + 1}`,
        x, y, 5, outer, inner, fillColor,
        defaultClipFrames(composition)
      );
      if (layer.type === 'shape' && layer.shape.type === 'star') {
        layer.shape.strokeColor = strokeColor;
        layer.shape.strokeWidth.defaultValue = 1;
      }
    } else {
      const count = composition.layers.filter((l) => l.type === 'shape' && l.shape.type === 'polygon').length;
      const hw = width / 2;
      const hh = height / 2;
      const vertices = [
        { position: [-hw, -hh] as [number, number], handleIn: [0, 0] as [number, number], handleOut: [0, 0] as [number, number], vertexType: 'corner' as const },
        { position: [hw, -hh] as [number, number], handleIn: [0, 0] as [number, number], handleOut: [0, 0] as [number, number], vertexType: 'corner' as const },
        { position: [hw, hh] as [number, number], handleIn: [0, 0] as [number, number], handleOut: [0, 0] as [number, number], vertexType: 'corner' as const },
        { position: [-hw, hh] as [number, number], handleIn: [0, 0] as [number, number], handleOut: [0, 0] as [number, number], vertexType: 'corner' as const },
      ];
      layer = createPolygonLayer(
        `Polygon ${count + 1}`,
        x, y, vertices, true, fillColor,
        defaultClipFrames(composition)
      );
      if (layer.type === 'shape' && layer.shape.type === 'polygon') {
        layer.shape.strokeColor = strokeColor;
        layer.shape.strokeWidth.defaultValue = 1;
      }
    }

    const newComp = settleComposition(ensureLayerHasTrack(
      { ...composition, layers: [...composition.layers, layer] },
      layer
    ));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: `Create ${shapeType}`,
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addText: (content = 'Text') => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const x = composition.settings.width / 2;
    const y = composition.settings.height / 2;
    const textCount = composition.layers.filter((l) => l.type === 'text').length;

    const layer = createTextLayer(
      `Text ${textCount + 1}`, x, y, content,
      defaultClipFrames(composition)
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Text',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addParticleLayer: () => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const x = composition.settings.width / 2;
    const y = composition.settings.height / 2;
    const count = composition.layers.filter((l) => l.type === 'particle').length;
    const preset = 'fire';
    const presetConfig = PARTICLE_PRESETS[preset]();

    const layer = createParticleLayer(
      `Particles ${count + 1}`, x, y, preset,
      JSON.stringify(presetConfig),
      defaultClipFrames(composition)
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Particle Layer',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addFieldSampledLayer: (configJSON) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const x = composition.settings.width / 2;
    const y = composition.settings.height / 2;
    const count = composition.layers.filter((l) => l.type === 'fieldSampled').length;
    const config = configJSON || JSON.stringify({
      field: { type: 'glyph', text: '?', fontFamily: 'Inter', fontSize: 400, fontWeight: 700, resolution: 1 },
      sampler: { type: 'grid', cellSize: 8, jitter: 0, dotSizeMin: 1, dotSizeMax: 6, threshold: 0.1 },
      mark: { color: [1, 1, 1, 1], shape: 'dot', sizeMin: 1, sizeMax: 8, strokeWidth: 1.5, roundCaps: true },
      animation: { rotationSpeed: 0, morphSpeed: 0, noiseEvolution: 0.5, breatheAmplitude: 0, breatheSpeed: 1 },
      canvasWidth: composition.settings.width,
      canvasHeight: composition.settings.height,
    });

    const layer = createFieldSampledLayer(
      `Field Sampled ${count + 1}`, x, y, config,
      defaultClipFrames(composition)
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Field Sampled Layer',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addAnimationItem: (presetName) => {
    const { composition, selection } = get();
    const preset = ANIMATION_ITEM_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    const oldComp = composition;
    const oldSel = selection;

    const x = composition.settings.width / 2;
    const y = composition.settings.height / 2;

    const layer = createAnimationItemLayer(
      presetName,
      x, y,
      preset.itemConfig.type,
      JSON.stringify(preset.itemConfig),
      JSON.stringify(preset.dataSource),
      defaultClipFrames(composition),
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Animation Item',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addLottieIcon: (jsonPath, jsonData, totalFrames, frameRate, sourceWidth, sourceHeight, name) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const x = composition.settings.width / 2;
    const y = composition.settings.height / 2;

    const layer = createLottieIconLayer(
      name,
      x, y,
      jsonPath,
      jsonData,
      totalFrames,
      frameRate,
      sourceWidth,
      sourceHeight,
      defaultClipFrames(composition),
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Lottie Icon',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addLayoutObject: (layoutType) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;
    const x = composition.settings.width / 2;
    const y = composition.settings.height / 2;
    const name = layoutType === 'hbox' ? 'HBox' : layoutType === 'vbox' ? 'VBox' : 'Grid';
    const count = composition.layers.filter((l) => l.type === layoutType).length;
    const layer = createLayoutObjectLayer(`${name} ${count + 1}`, layoutType, x, y, defaultClipFrames(composition));
    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);
    exec({
      label: `Add ${name}`,
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addLayoutContainer: (shapeType = 'circle') => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;
    const x = composition.settings.width / 2;
    const y = composition.settings.height / 2;
    const count = composition.layers.filter((l) => l.type === 'layoutContainer').length;
    const layer = createLayoutContainerLayer(`Container ${count + 1}`, shapeType, x, y, defaultClipFrames(composition));
    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);
    exec({
      label: 'Add Layout Container',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addChildToLayoutContainer: (containerId, childId) => {
    const { composition } = get();
    const oldComp = composition;
    const container = composition.layers.find((l) => l.id === containerId) as LayoutContainerLayer | undefined;
    if (!container || container.type !== 'layoutContainer') return;
    if (container.children.some((c) => c.id === childId)) return;
    const newEntry = { id: childId, normalizedPosition: -1 };
    const updatedContainer: LayoutContainerLayer = {
      ...container,
      children: [...container.children, newEntry],
      computedData: null,
    };
    const updatedLayers = composition.layers.map((l) =>
      l.id === containerId ? updatedContainer : l.id === childId ? { ...l, parentId: containerId } : l
    );
    const newComp = settleComposition({ ...composition, layers: updatedLayers });
    exec({
      label: 'Add to Container',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  removeChildFromLayoutContainer: (containerId, childId) => {
    const { composition } = get();
    const oldComp = composition;
    const container = composition.layers.find((l) => l.id === containerId) as LayoutContainerLayer | undefined;
    if (!container || container.type !== 'layoutContainer') return;
    const updatedContainer: LayoutContainerLayer = {
      ...container,
      children: container.children.filter((c) => c.id !== childId),
      computedData: null,
    };
    const updatedLayers = composition.layers.map((l) =>
      l.id === containerId ? updatedContainer : l.id === childId ? { ...l, parentId: null } : l
    );
    const newComp = settleComposition({ ...composition, layers: updatedLayers });
    exec({
      label: 'Remove from Container',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updateLayoutContainer: (containerId, updates) => {
    const { composition } = get();
    const oldComp = composition;
    const container = composition.layers.find((l) => l.id === containerId) as LayoutContainerLayer | undefined;
    if (!container || container.type !== 'layoutContainer') return;
    const updatedContainer: LayoutContainerLayer = {
      ...container,
      ...updates,
      containerShape: updates.containerShape ? { ...container.containerShape, ...updates.containerShape } : container.containerShape,
      computedData: null,
    };
    const updatedLayers = composition.layers.map((l) => l.id === containerId ? updatedContainer : l);
    const newComp = settleComposition({ ...composition, layers: updatedLayers });
    exec({
      label: 'Update Container',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  addChildToLayout: (layoutId, childId) => {
    const { composition } = get();
    const oldComp = composition;
    const layout = composition.layers.find((l) => l.id === layoutId) as LayoutObjectLayer | undefined;
    if (!layout || (layout.type !== 'hbox' && layout.type !== 'vbox' && layout.type !== 'grid')) return;
    if (layout.children.includes(childId)) return;
    const updatedLayout: LayoutObjectLayer = {
      ...layout,
      children: [...layout.children, childId],
      childOverrides: { ...layout.childOverrides, [childId]: createDefaultChildOverride() },
    };
    const updatedLayers = composition.layers.map((l) =>
      l.id === layoutId ? updatedLayout : l.id === childId ? { ...l, parentId: layoutId } : l
    );
    const newComp = settleComposition({ ...composition, layers: updatedLayers });
    exec({
      label: 'Add to Layout',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  removeChildFromLayout: (layoutId, childId) => {
    const { composition } = get();
    const oldComp = composition;
    const layout = composition.layers.find((l) => l.id === layoutId) as LayoutObjectLayer | undefined;
    if (!layout || (layout.type !== 'hbox' && layout.type !== 'vbox')) return;
    const { [childId]: _, ...rest } = layout.childOverrides;
    const updatedLayout: LayoutObjectLayer = {
      ...layout,
      children: layout.children.filter((id) => id !== childId),
      childOverrides: rest,
    };
    const updatedLayers = composition.layers.map((l) =>
      l.id === layoutId ? updatedLayout : l.id === childId ? { ...l, parentId: null } : l
    );
    const newComp = settleComposition({ ...composition, layers: updatedLayers });
    exec({
      label: 'Remove from Layout',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  reorderLayoutChild: (layoutId, childId, newIndex) => {
    const { composition } = get();
    const oldComp = composition;
    const layout = composition.layers.find((l) => l.id === layoutId) as LayoutObjectLayer | undefined;
    if (!layout || (layout.type !== 'hbox' && layout.type !== 'vbox')) return;
    const filtered = layout.children.filter((id) => id !== childId);
    filtered.splice(newIndex, 0, childId);
    const updatedLayout: LayoutObjectLayer = { ...layout, children: filtered };
    const updatedLayers = composition.layers.map((l) => l.id === layoutId ? updatedLayout : l);
    const newComp = settleComposition({ ...composition, layers: updatedLayers });
    exec({
      label: 'Reorder Layout Child',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updateLayoutParams: (layoutId, updates) => {
    const { composition } = get();
    const oldComp = composition;
    const layout = composition.layers.find((l) => l.id === layoutId) as LayoutObjectLayer | undefined;
    if (!layout || (layout.type !== 'hbox' && layout.type !== 'vbox')) return;
    const updatedLayout: LayoutObjectLayer = {
      ...layout,
      layoutParams: { ...layout.layoutParams, ...updates },
    };
    const updatedLayers = composition.layers.map((l) => l.id === layoutId ? updatedLayout : l);
    const newComp = settleComposition({ ...composition, layers: updatedLayers });
    exec({
      label: 'Update Layout',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updateChildOverride: (layoutId, childId, updates) => {
    const { composition } = get();
    const oldComp = composition;
    const layout = composition.layers.find((l) => l.id === layoutId) as LayoutObjectLayer | undefined;
    if (!layout || (layout.type !== 'hbox' && layout.type !== 'vbox')) return;
    const existing = layout.childOverrides[childId] || createDefaultChildOverride();
    const updatedLayout: LayoutObjectLayer = {
      ...layout,
      childOverrides: { ...layout.childOverrides, [childId]: { ...existing, ...updates } },
    };
    const updatedLayers = composition.layers.map((l) => l.id === layoutId ? updatedLayout : l);
    const newComp = settleComposition({ ...composition, layers: updatedLayers });
    exec({
      label: 'Update Child Layout',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  wrapInLayout: (layerIds, layoutType) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;
    if (layerIds.length === 0) return;
    const layers = layerIds.map((id) => composition.layers.find((l) => l.id === id)).filter(Boolean) as Layer[];
    if (layers.length === 0) return;
    const name = layoutType === 'hbox' ? 'HBox' : layoutType === 'vbox' ? 'VBox' : 'Grid';
    const count = composition.layers.filter((l) => l.type === layoutType).length;
    const centerX = layers.reduce((s, l) => s + evaluateVec2(l.transform.position, 0)[0], 0) / layers.length;
    const centerY = layers.reduce((s, l) => s + evaluateVec2(l.transform.position, 0)[1], 0) / layers.length;
    const layout = createLayoutObjectLayer(`${name} ${count + 1}`, layoutType, centerX, centerY, defaultClipFrames(composition));
    layout.children = layerIds;
    const overrides: Record<string, ReturnType<typeof createDefaultChildOverride>> = {};
    for (const id of layerIds) overrides[id] = createDefaultChildOverride();
    layout.childOverrides = overrides;
    const updatedLayers = [
      ...composition.layers.map((l) => layerIds.includes(l.id) ? { ...l, parentId: layout.id } : l),
      layout,
    ];
    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: updatedLayers }, layout));
    const newSel: SelectionState = sel([layout.id], layout.id);
    exec({
      label: `Wrap in ${name}`,
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  unwrapLayout: (layoutId) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;
    const layout = composition.layers.find((l) => l.id === layoutId) as LayoutObjectLayer | undefined;
    if (!layout || (layout.type !== 'hbox' && layout.type !== 'vbox' && layout.type !== 'grid')) return;
    const updatedLayers = composition.layers
      .filter((l) => l.id !== layoutId)
      .map((l) => layout.children.includes(l.id) ? { ...l, parentId: layout.parentId } : l);
    const newComp = settleComposition({ ...composition, layers: updatedLayers });
    const newSel: SelectionState = sel([], null);
    exec({
      label: 'Unwrap Layout',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addCaptionClips: (segments, options, clipStartFrame) => {
    const { composition, selection } = get();
    if (segments.length === 0) return;
    const oldComp = composition;
    const oldSel = selection;

    const CAPTION_TRACK_NAME = 'Captions';
    // Reuse an existing caption track; otherwise create one above all visual
    // tracks so captions render on top. settleComposition renumbers tracks
    // visual-first, so the lowest order resolves to the top slot.
    const existing = composition.tracks.find((t) => t.type === 'text' && t.name === CAPTION_TRACK_NAME);
    let tracks = composition.tracks;
    let trackId: string;
    if (existing) {
      trackId = existing.id;
    } else {
      const minVisualOrder = composition.tracks
        .filter((t) => t.type !== 'audio')
        .reduce((m, t) => Math.min(m, t.order), 0);
      const track = createTrack(CAPTION_TRACK_NAME, 'text', minVisualOrder - 1);
      trackId = track.id;
      tracks = [...composition.tracks, track];
    }

    const captionLayers = buildCaptionLayers({
      segments,
      compWidth: composition.settings.width,
      compHeight: composition.settings.height,
      frameRate: composition.settings.frameRate,
      position: options.position,
      style: options.style,
      clipStartOffsetFrames: clipStartFrame,
    }).map((l) => ({ ...l, trackId }));

    // Guarantee no two caption clips overlap on the shared track after frame
    // rounding; clamp each clip's end to the next clip's start.
    for (let i = 0; i < captionLayers.length - 1; i++) {
      const next = captionLayers[i + 1];
      if (captionLayers[i].outPoint > next.inPoint) {
        captionLayers[i].outPoint = Math.max(captionLayers[i].inPoint + 1, next.inPoint);
      }
    }

    const newComp = settleComposition({
      ...composition,
      tracks,
      layers: [...composition.layers, ...captionLayers],
    });
    const newSel: SelectionState = sel(captionLayers.map((l) => l.id), captionLayers[0].id);

    exec({
      label: 'Generate Captions',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  stripSilence: (layerId, segments) => {
    const { composition, selection } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer || (layer.type !== 'video' && layer.type !== 'audio')) return [];
    if (segments.length === 0) return [];

    const oldComp = composition;
    const oldSel = selection;

    const originalIn = layer.inPoint;
    const originalOut = layer.outPoint;
    const keptFrames = segments.reduce((sum, s) => sum + s.lengthFrames, 0);
    const removedFrames = originalOut - originalIn - keptFrames;

    // Lay retained speech segments back-to-back starting where the clip began,
    // each pointing at its own slice of the source via startOffset. Cloned
    // animatable ids are regenerated so the segments never share keyframe
    // identity with the original (or each other).
    const sourceStartOffset =
      layer.type === 'video' ? layer.video.startOffset : layer.audio.startOffset;

    let place = originalIn;
    const newSegmentLayers: Layer[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.lengthFrames <= 0) continue;
      const clone = JSON.parse(JSON.stringify(layer)) as Layer;
      processAnimatables(clone, null);
      clone.id = uid();
      clone.inPoint = place;
      clone.outPoint = place + seg.lengthFrames;
      clone.name = segments.length > 1 ? `${layer.name} ${i + 1}` : layer.name;
      if (clone.type === 'video') {
        clone.video.startOffset = sourceStartOffset + seg.sourceLocalStart;
      } else if (clone.type === 'audio') {
        clone.audio.startOffset = sourceStartOffset + seg.sourceLocalStart;
      }
      place += seg.lengthFrames;
      newSegmentLayers.push(clone);
    }

    if (newSegmentLayers.length === 0) return [];

    const track = composition.tracks.find((t) => t.id === layer.trackId);
    const compressed = track ? isTrackCompressed(track) : false;

    // On absolute (non-compressed) tracks, pull every downstream clip on the
    // same track left by the removed span so no gap is left where silence was.
    // Compressed tracks reflow by order in settleComposition, so leave them be.
    const rest = composition.layers
      .filter((l) => l.id !== layerId)
      .map((l) => {
        if (!compressed && l.trackId === layer.trackId && l.inPoint >= originalOut) {
          return { ...l, inPoint: l.inPoint - removedFrames, outPoint: l.outPoint - removedFrames };
        }
        return l;
      });

    const newComp = settleComposition({
      ...composition,
      layers: [...rest, ...newSegmentLayers],
    });
    const newSel: SelectionState = sel(newSegmentLayers.map((l) => l.id), newSegmentLayers[0].id);

    exec({
      label: 'Strip Silence',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });

    return newSegmentLayers.map((l) => l.id);
  },

  explodeTextLayer: (layerId, splitMode, staggerFrames) => {
    const { composition, selection } = get();
    const source = composition.layers.find((l) => l.id === layerId);
    if (!source || source.type !== 'text') return;

    // All layout/measurement runs locally up front; we only commit once.
    const elements = computeExplodeElements(source, splitMode, source.inPoint);
    if (!elements || elements.length === 0) return;

    const oldComp = composition;
    const oldSel = selection;

    // Each clip gets its own track in a pyramid/staircase arrangement so they
    // don't overlap. Tracks stack starting at the source's order.
    const sourceTrack = composition.tracks.find((t) => t.id === source.trackId);
    const baseOrder = sourceTrack
      ? sourceTrack.order
      : composition.tracks.filter((t) => t.type !== 'audio').reduce((m, t) => Math.max(m, t.order), -1) + 1;

    const baseName = source.name;
    const newTracks: Track[] = [];
    const generated: Layer[] = elements.map((el, i) => {
      const shift = Math.round(el.index * staggerFrames);
      const clone = cloneTextLayerForExplode(source, el.deltaX, el.deltaY, shift);
      clone.name = `${baseName} ${el.index + 1}`;
      clone.content = { spans: [{ text: el.content, style: clone.content.spans[0].style }] };
      const track = createTrack(`${baseName} ${el.index + 1}`, 'text', baseOrder + i);
      newTracks.push(track);
      clone.trackId = track.id;
      return clone;
    });

    const newComp = settleComposition({
      ...composition,
      tracks: [...composition.tracks, ...newTracks],
      layers: [...composition.layers.filter((l) => l.id !== layerId), ...generated],
    });
    const newSel: SelectionState = sel(generated.map((l) => l.id), generated[0].id);

    exec({
      label: 'Text Motion Control',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });

    persistExplodeGroup({
      projectId: useProjectStore.getState().activeProjectId,
      groupId: newTracks[0]?.id ?? '',
      originalClipId: layerId,
      splitMode,
      staggerFrames,
      clipCount: generated.length,
    });
  },

  addVideo: async (file: File, projectId: string, playbackMode: VideoPlaybackMode = 'wait') => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const { assetId, metadata } = await mediaAssetManager.importVideo(file, projectId);

    const x = composition.settings.width / 2;
    const y = composition.settings.height / 2;
    const videoCount = composition.layers.filter((l) => l.type === 'video').length;
    const name = file.name.replace(/\.[^.]+$/, '') || `Video ${videoCount + 1}`;

    const videoDurationFrames = Math.ceil(metadata.duration * composition.settings.frameRate);

    const layer = createVideoLayer(
      name,
      x, y,
      assetId,
      metadata.width,
      metadata.height,
      metadata.duration,
      metadata.frameRate,
      videoDurationFrames,
      playbackMode,
      DEFAULT_PROXY_SCALE
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Video',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });

  },

  addImage: async (file: File, projectId: string) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const { assetId, metadata } = await mediaAssetManager.importImage(file, projectId);

    const x = composition.settings.width / 2;
    const y = composition.settings.height / 2;

    const layer = createImageLayer(
      file.name.replace(/\.[^.]+$/, '') || `Image ${composition.layers.filter((l) => l.type === 'image').length + 1}`,
      x, y,
      assetId,
      metadata.width,
      metadata.height,
      metadata.format,
      metadata.fileSize,
      defaultClipFrames(composition)
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Image',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addImageFromAsset: (assetId, x, y) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const meta = mediaAssetManager.getImageMetadata(assetId);
    if (!meta) return;
    const asset = mediaAssetManager.getAsset(assetId);
    const name = asset?.name?.replace(/\.[^.]+$/, '') || 'Image';

    const layer = createImageLayer(
      name,
      x, y,
      assetId,
      meta.width,
      meta.height,
      meta.format,
      meta.fileSize,
      defaultClipFrames(composition)
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Image',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addVideoFromAsset: (assetId, x, y, playbackMode: VideoPlaybackMode = 'wait') => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const meta = mediaAssetManager.getMetadata(assetId);
    if (!meta) return;
    const asset = mediaAssetManager.getAsset(assetId);
    const name = asset?.name?.replace(/\.[^.]+$/, '') || 'Video';

    const videoDurationFrames = Math.ceil(meta.duration * composition.settings.frameRate);

    const layer = createVideoLayer(
      name,
      x, y,
      assetId,
      meta.width,
      meta.height,
      meta.duration,
      meta.frameRate,
      videoDurationFrames,
      playbackMode,
      DEFAULT_PROXY_SCALE
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Video',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });

  },

  addAudio: async (file: File, projectId: string) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const { assetId, metadata } = await mediaAssetManager.importAudio(file, projectId);
    const audioDurationFrames = Math.ceil(metadata.duration * composition.settings.frameRate);

    const layer = createAudioLayer(
      file.name.replace(/\.[^.]+$/, '') || 'Audio',
      assetId,
      metadata.duration,
      metadata.sampleRate,
      metadata.channels,
      audioDurationFrames
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Audio',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  addAudioFromAsset: (assetId) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    const meta = mediaAssetManager.getAudioMetadata(assetId);
    if (!meta) return;
    const asset = mediaAssetManager.getAsset(assetId);
    const name = asset?.name?.replace(/\.[^.]+$/, '') || 'Audio';

    const audioDurationFrames = Math.ceil(meta.duration * composition.settings.frameRate);

    const layer = createAudioLayer(
      name,
      assetId,
      meta.duration,
      meta.sampleRate,
      meta.channels,
      audioDurationFrames
    );

    const newComp = settleComposition(ensureLayerHasTrack({ ...composition, layers: [...composition.layers, layer] }, layer));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Add Audio',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  removeLayer: (id) => {
    get().removeLayers([id]);
  },

  // Batch delete: removes the entire selection (plus any group descendants) in a
  // single undoable operation. One settle pass handles track pruning, compressed
  // reflow, and duration recalculation; selection is cleared of dangling refs.
  removeLayers: (ids) => {
    const { composition, selection } = get();
    if (ids.length === 0) return;

    const oldComp = composition;
    const oldSel = selection;

    const idsToRemove = new Set<string>();
    for (const id of ids) {
      const layer = composition.layers.find((l) => l.id === id);
      if (!layer) continue;
      idsToRemove.add(id);
      if (layer.type === 'group') {
        for (const d of getDescendants(id, composition.layers)) idsToRemove.add(d.id);
      }
    }
    if (idsToRemove.size === 0) return;

    for (const id of idsToRemove) {
      const layer = composition.layers.find((l) => l.id === id);
      if (layer?.type === 'video') {
        frameScheduler.unregisterAsset(layer.video.assetId);
        videoTextureCache.destroyLayer(layer.id);
        videoAudioPlayer.releaseRef(layer.video.assetId);
      }
    }

    const newLayers = composition.layers.filter((l) => !idsToRemove.has(l.id));
    const newComp = settleComposition({ ...composition, layers: newLayers });
    const newSel: SelectionState = sel([]);

    exec({
      label: idsToRemove.size > 1 ? 'Delete Layers' : 'Delete Layer',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  updateLayerProperty: (layerId, path, value) => {
    const history = useHistoryStore.getState();
    if (history.isUndoing || history.isBatching) {
      const { composition } = get();
      const layers = composition.layers.map((layer) => {
        if (layer.id !== layerId) return layer;
        return deepSet(layer, path, value) as Layer;
      });
      set({ composition: { ...composition, layers } });
      return;
    }

    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const oldComp = composition;

    const newLayers = composition.layers.map((l) => {
      if (l.id !== layerId) return l;
      return deepSet(l, path, value) as Layer;
    });
    const newComp = { ...composition, layers: newLayers };

    exec({
      label: 'Update Property',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  setLayerEffectParam: (layerId, type, paramIndex, value, defaults = []) => {
    const applyToLayer = (layer: Layer): Layer => {
      if (layer.type !== 'image') return layer;
      const effects = layer.effects ? layer.effects.slice() : [];
      const idx = effects.findIndex((e) => e.type === type);
      const params = idx >= 0 ? effects[idx].params.slice() : defaults.slice();
      while (params.length <= paramIndex) params.push(0);
      params[paramIndex] = value;
      if (idx >= 0) {
        effects[idx] = { ...effects[idx], params };
      } else {
        effects.push({ type, enabled: true, params });
      }
      return { ...layer, effects };
    };

    const { composition } = get();
    const history = useHistoryStore.getState();
    if (history.isUndoing || history.isBatching) {
      set({ composition: { ...composition, layers: composition.layers.map((l) => (l.id === layerId ? applyToLayer(l) : l)) } });
      return;
    }
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'image') return;
    const oldComp = composition;
    const newComp = { ...composition, layers: composition.layers.map((l) => (l.id === layerId ? applyToLayer(l) : l)) };
    exec({
      label: 'Adjust Filter',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  removeLayerEffect: (layerId, type) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'image' || !layer.effects?.some((e) => e.type === type)) return;
    const oldComp = composition;
    const newComp = {
      ...composition,
      layers: composition.layers.map((l) => {
        if (l.id !== layerId || l.type !== 'image') return l;
        return { ...l, effects: (l.effects ?? []).filter((e) => e.type !== type) };
      }),
    };
    exec({
      label: 'Remove Filter',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  setLayerParent: (childId, parentId) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === childId);
    if (!layer) return;
    if (layer.parentId === parentId) return;
    if (!canParentTo(childId, parentId, composition.layers)) return;

    const oldComp = composition;
    const newLayers = composition.layers.map((l) =>
      l.id === childId ? ({ ...l, parentId } as Layer) : l
    );
    const newComp = { ...composition, layers: newLayers };

    exec({
      label: 'Set Parent',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  addKeyframe: (layerId, propertyPath, frame, value) => {
    const history = useHistoryStore.getState();
    if (history.isUndoing || history.isBatching) {
      const { composition } = get();
      const layers = composition.layers.map((layer) => {
        if (layer.id !== layerId) return layer;
        const prop = deepGet(layer, propertyPath) as AnimatableProperty;
        if (!prop || !prop.keyframes) return layer;
        const existing = prop.keyframes.findIndex((k: Keyframe) => k.frame === frame);
        let newKeyframes: Keyframe[];
        if (existing >= 0) {
          newKeyframes = prop.keyframes.map((k: Keyframe, i: number) => i === existing ? { ...k, value } : k);
        } else {
          newKeyframes = [...prop.keyframes, createKeyframe(frame, value)].sort((a, b) => a.frame - b.frame);
        }
        return deepSet(layer, `${propertyPath}.keyframes`, newKeyframes) as Layer;
      });
      set({ composition: { ...composition, layers } });
      return;
    }

    const { composition } = get();
    const oldComp = composition;

    const newLayers = composition.layers.map((layer) => {
      if (layer.id !== layerId) return layer;
      const prop = deepGet(layer, propertyPath) as AnimatableProperty;
      if (!prop || !prop.keyframes) return layer;

      const existing = prop.keyframes.findIndex((k: Keyframe) => k.frame === frame);
      let newKeyframes: Keyframe[];
      if (existing >= 0) {
        newKeyframes = prop.keyframes.map((k: Keyframe, i: number) =>
          i === existing ? { ...k, value } : k
        );
      } else {
        newKeyframes = [...prop.keyframes, createKeyframe(frame, value)].sort(
          (a, b) => a.frame - b.frame
        );
      }

      return deepSet(layer, `${propertyPath}.keyframes`, newKeyframes) as Layer;
    });
    const newComp = { ...composition, layers: newLayers };

    exec({
      label: 'Add Keyframe',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  deleteKeyframes: (layerId, targets) => {
    if (targets.length === 0) return;
    const framesByPath = groupTargetFrames(targets);
    const { composition } = get();
    const oldComp = composition;
    const newLayers = composition.layers.map((layer) => {
      if (layer.id !== layerId) return layer;
      let updated = layer;
      for (const [path, frames] of framesByPath) {
        const prop = deepGet(updated, path) as AnimatableProperty | undefined;
        if (!prop || !prop.keyframes) continue;
        const kept = prop.keyframes.filter((k: Keyframe) => !frames.has(k.frame));
        updated = deepSet(updated, `${path}.keyframes`, kept) as Layer;
      }
      return updated;
    });
    const newComp = { ...composition, layers: newLayers };
    exec({
      label: 'Delete Keyframes',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  setKeyframeInterpolation: (layerId, targets, interpolation, handleIn, handleOut) => {
    if (targets.length === 0) return;
    const framesByPath = groupTargetFrames(targets);
    const { composition } = get();
    const oldComp = composition;
    const newLayers = composition.layers.map((layer) => {
      if (layer.id !== layerId) return layer;
      let updated = layer;
      for (const [path, frames] of framesByPath) {
        const prop = deepGet(updated, path) as AnimatableProperty | undefined;
        if (!prop || !prop.keyframes) continue;
        const newKfs = prop.keyframes.map((k: Keyframe) => frames.has(k.frame)
          ? { ...k, interpolation, handleIn: handleIn ?? k.handleIn, handleOut: handleOut ?? k.handleOut }
          : k);
        updated = deepSet(updated, `${path}.keyframes`, newKfs) as Layer;
      }
      return updated;
    });
    const newComp = { ...composition, layers: newLayers };
    exec({
      label: 'Set Keyframe Interpolation',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  applyAnimationPreset: (layerId, presetId) => {
    const preset = getPresetById(presetId);
    if (!preset) return;

    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer || !('transform' in layer) || !layer.transform) return;

    const startFrame = useTimelineStore.getState().currentFrame;
    const durationFrames = Math.max(1, Math.round(composition.settings.frameRate));

    const ctx: PresetContext = {
      position: evaluateVec2(layer.transform.position, startFrame),
      scale: evaluateVec2(layer.transform.scale, startFrame),
      rotation: evaluateNumber(layer.transform.rotation, startFrame),
      opacity: evaluateNumber(layer.transform.opacity, startFrame),
      compWidth: composition.settings.width,
      compHeight: composition.settings.height,
    };

    const tracks = generatePresetKeyframes(preset, ctx, startFrame, durationFrames);

    const oldComp = composition;
    let updatedLayer: Layer = layer;
    for (const track of tracks) {
      const prop = deepGet(updatedLayer, track.propertyPath) as AnimatableProperty | undefined;
      if (!prop || !prop.keyframes) continue;
      const byFrame = new Map<number, Keyframe>();
      for (const kf of prop.keyframes) byFrame.set(kf.frame, kf);
      for (const kf of track.keyframes) byFrame.set(kf.frame, kf);
      const merged = Array.from(byFrame.values()).sort((a, b) => a.frame - b.frame);
      updatedLayer = deepSet(updatedLayer, `${track.propertyPath}.keyframes`, merged) as Layer;
    }

    const newLayers = composition.layers.map((l) => (l.id === layerId ? updatedLayer : l));
    const newComp = { ...composition, layers: newLayers };

    exec({
      label: `Apply ${preset.name}`,
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  applyAnimationPresetBatch: (layerIds, presetId, durationSeconds, atStart) => {
    const preset = getPresetById(presetId);
    if (!preset) return;

    const { composition } = get();
    const frameRate = composition.settings.frameRate;
    const durationFrames = Math.max(1, Math.round(durationSeconds * frameRate));
    const playhead = useTimelineStore.getState().currentFrame;

    const oldComp = composition;
    let updatedLayers = [...composition.layers];

    for (const layerId of layerIds) {
      const layerIdx = updatedLayers.findIndex((l) => l.id === layerId);
      if (layerIdx === -1) continue;
      const layer = updatedLayers[layerIdx];
      if (!('transform' in layer) || !layer.transform) continue;

      const startFrame = atStart ? layer.inPoint : playhead;

      const ctx: PresetContext = {
        position: evaluateVec2(layer.transform.position, startFrame),
        scale: evaluateVec2(layer.transform.scale, startFrame),
        rotation: evaluateNumber(layer.transform.rotation, startFrame),
        opacity: evaluateNumber(layer.transform.opacity, startFrame),
        compWidth: composition.settings.width,
        compHeight: composition.settings.height,
      };

      const tracks = generatePresetKeyframes(preset, ctx, startFrame, durationFrames);

      let updatedLayer: Layer = layer;
      for (const track of tracks) {
        const prop = deepGet(updatedLayer, track.propertyPath) as AnimatableProperty | undefined;
        if (!prop || !prop.keyframes) continue;
        const byFrame = new Map<number, Keyframe>();
        for (const kf of prop.keyframes) byFrame.set(kf.frame, kf);
        for (const kf of track.keyframes) byFrame.set(kf.frame, kf);
        const merged = Array.from(byFrame.values()).sort((a, b) => a.frame - b.frame);
        updatedLayer = deepSet(updatedLayer, `${track.propertyPath}.keyframes`, merged) as Layer;
      }

      updatedLayers[layerIdx] = updatedLayer;
    }

    const newComp = { ...composition, layers: updatedLayers };

    exec({
      label: `Apply ${preset.name} to ${layerIds.length} clip${layerIds.length > 1 ? 's' : ''}`,
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  setCompositionSetting: (key, value) => {
    const { composition } = get();
    const oldComp = composition;
    // The user-facing "duration" field is the minimum floor; the live actual
    // duration grows automatically from clip content.
    const newComp =
      key === 'durationFrames' || key === 'minimumDurationFrames'
        ? withMinimumDuration(composition, value)
        : recomputeCompositionDuration({ ...composition, settings: { ...composition.settings, [key]: value } });

    exec({
      label: `Change ${key}`,
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  createGroup: () => {
    const { composition, selection, currentFrame } = get();
    const { selectedIds } = selection;
    if (selectedIds.length === 0) return;

    const selectedLayers = composition.layers.filter((l) => selectedIds.includes(l.id));
    if (selectedLayers.length === 0) return;

    const oldComp = composition;
    const oldSel = selection;

    let centerX = 0, centerY = 0, count = 0;
    for (const layer of selectedLayers) {
      const pos = evaluateVec2(layer.transform.position, currentFrame);
      centerX += pos[0];
      centerY += pos[1];
      count++;
    }
    if (count > 0) { centerX /= count; centerY /= count; }

    const group = createGroupLayer(
      `Group ${composition.layers.filter((l) => l.type === 'group').length + 1}`,
      centerX, centerY,
      composition.settings.durationFrames
    );

    const updatedLayers = composition.layers.map((layer) => {
      if (!selectedIds.includes(layer.id)) return layer;
      const pos = evaluateVec2(layer.transform.position, currentFrame);
      const localX = pos[0] - centerX;
      const localY = pos[1] - centerY;
      return deepSet(
        deepSet(
          deepSet(layer, 'parentId', group.id) as Layer,
          'transform.position.defaultValue', [localX, localY] as Vec2
        ) as Layer,
        'transform.position.keyframes', []
      ) as Layer;
    });

    const firstSelectedIdx = updatedLayers.findIndex((l) => selectedIds.includes(l.id));
    const newLayers = [
      ...updatedLayers.slice(0, firstSelectedIdx),
      group,
      ...updatedLayers.slice(firstSelectedIdx),
    ];

    const newComp = settleComposition({ ...composition, layers: newLayers });
    const newSel: SelectionState = sel([group.id], group.id);

    exec({
      label: 'Create Group',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  ungroupSelection: () => {
    const { composition, selection, currentFrame } = get();
    const { selectedIds } = selection;
    const groupsToUngroup = composition.layers.filter(
      (l) => selectedIds.includes(l.id) && l.type === 'group'
    );
    if (groupsToUngroup.length === 0) return;

    const oldComp = composition;
    const oldSel = selection;

    let layers = [...composition.layers];
    const ungroupedChildIds: string[] = [];

    for (const group of groupsToUngroup) {
      const groupPos = evaluateVec2(group.transform.position, currentFrame);
      const parentId = group.parentId;

      layers = layers.map((layer) => {
        if (layer.parentId !== group.id) return layer;
        const childPos = evaluateVec2(layer.transform.position, currentFrame);
        const worldX = groupPos[0] + childPos[0];
        const worldY = groupPos[1] + childPos[1];
        ungroupedChildIds.push(layer.id);
        return deepSet(
          deepSet(
            deepSet(layer, 'parentId', parentId) as Layer,
            'transform.position.defaultValue', [worldX, worldY] as Vec2
          ) as Layer,
          'transform.position.keyframes', []
        ) as Layer;
      });

      layers = layers.filter((l) => l.id !== group.id);
    }

    const newComp = settleComposition({ ...composition, layers });
    const newSel: SelectionState = sel(ungroupedChildIds, ungroupedChildIds[0] || null);

    exec({
      label: 'Ungroup',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  copySelection: () => {
    const { composition, selection, selectionSource, currentFrame } = get();
    const ids = selection.selectedIds.length > 0 ? selection.selectedIds : (selection.activeId ? [selection.activeId] : []);
    if (ids.length === 0) return;
    const withKeyframes = selectionSource === 'timeline';
    const bakeFrame = withKeyframes ? null : currentFrame;
    const layers = ids
      .map((id) => composition.layers.find((l) => l.id === id))
      .filter((l): l is Layer => !!l)
      .map((l) => {
        const snapshot = JSON.parse(JSON.stringify(l)) as Layer;
        if (!withKeyframes) processAnimatables(snapshot, bakeFrame);
        return snapshot;
      });
    if (layers.length === 0) return;
    const bindings = (composition.physicsBindings || []).filter((b) => ids.includes(b.layerId));
    set({ clipboard: { layers, withKeyframes, physicsBindings: bindings.length > 0 ? JSON.parse(JSON.stringify(bindings)) : undefined } });
  },

  pasteClipboard: () => {
    const { clipboard, composition, selection, randomizeColors } = get();
    if (!clipboard || clipboard.layers.length === 0) return;
    const oldComp = composition;
    const oldSel = selection;
    let working = composition;
    const newIds: string[] = [];
    const idMap = new Map<string, string>();
    for (const source of clipboard.layers) {
      const clone = instantiatePastedLayer(source, { bakeFrame: null, randomize: randomizeColors });
      idMap.set(source.id, clone.id);
      working = ensureLayerHasTrack({ ...working, layers: [...working.layers, clone] }, clone);
      newIds.push(clone.id);
    }
    if (clipboard.physicsBindings && clipboard.physicsBindings.length > 0) {
      const newBindings = clipboard.physicsBindings
        .filter((b) => idMap.has(b.layerId))
        .map((b) => ({ ...b, id: uid(), layerId: idMap.get(b.layerId)! }));
      working = { ...working, physicsBindings: [...(working.physicsBindings || []), ...newBindings] };
    }
    const newComp = settleComposition(working);
    const newSel: SelectionState = sel(newIds, newIds[newIds.length - 1]);
    exec({
      label: 'Paste',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  duplicateSelection: () => {
    const { composition, selection, selectionSource, currentFrame, randomizeColors } = get();
    const ids = selection.selectedIds.length > 0 ? selection.selectedIds : (selection.activeId ? [selection.activeId] : []);
    if (ids.length === 0) return;
    const oldComp = composition;
    const oldSel = selection;
    const bakeFrame = selectionSource === 'timeline' ? null : currentFrame;
    let working = composition;
    const newIds: string[] = [];
    const idMap = new Map<string, string>();
    for (const id of ids) {
      const source = composition.layers.find((l) => l.id === id);
      if (!source) continue;
      const clone = instantiatePastedLayer(source, { bakeFrame, randomize: randomizeColors });
      idMap.set(source.id, clone.id);
      working = ensureLayerHasTrack({ ...working, layers: [...working.layers, clone] }, clone);
      newIds.push(clone.id);
    }
    if (newIds.length === 0) return;
    const existingBindings = (composition.physicsBindings || []).filter((b) => ids.includes(b.layerId));
    if (existingBindings.length > 0) {
      const newBindings = existingBindings
        .filter((b) => idMap.has(b.layerId))
        .map((b) => ({ ...b, id: uid(), layerId: idMap.get(b.layerId)! }));
      working = { ...working, physicsBindings: [...(working.physicsBindings || []), ...newBindings] };
    }
    const newComp = settleComposition(working);
    const newSel: SelectionState = sel(newIds, newIds[newIds.length - 1]);
    exec({
      label: 'Duplicate',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  toggleRandomizeColors: () => set({ randomizeColors: !get().randomizeColors }),

  commitDrag: (label, oldComp, oldSel) => {
    const { composition, selection } = get();
    const newComp = composition;
    const newSel = selection;

    if (oldComp === newComp) return;

    const { undoStack, maxHistory } = useHistoryStore.getState();
    const cmd: Command = {
      label,
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    };
    const newStack = [...undoStack, cmd];
    if (newStack.length > maxHistory) newStack.shift();
    useHistoryStore.setState({ undoStack: newStack, redoStack: [] });
  },

  createPenPath: (vertices, closed) => {
    const { composition, selection } = get();
    const oldComp = composition;
    const oldSel = selection;

    // The pen overlay produces vertices in composition space. Re-center them
    // around their centroid so the layer transform anchors sensibly.
    let cx = 0;
    let cy = 0;
    for (const v of vertices) { cx += v.position[0]; cy += v.position[1]; }
    cx /= Math.max(1, vertices.length);
    cy /= Math.max(1, vertices.length);

    const localVertices = vertices.map((v) => ({
      position: [v.position[0] - cx, v.position[1] - cy] as Vec2,
      handleIn: [v.handleIn[0], v.handleIn[1]] as Vec2,
      handleOut: [v.handleOut[0], v.handleOut[1]] as Vec2,
      vertexType: v.vertexType,
    }));

    const fillColor: [number, number, number, number] = closed ? [0.7, 0.7, 0.7, 1] : [0, 0, 0, 0];
    const count = composition.layers.filter((l) => l.type === 'shape' && l.shape.type === 'polygon').length;
    const layer = createPolygonLayer(
      `Path ${count + 1}`,
      cx, cy, localVertices, closed, fillColor,
      defaultClipFrames(composition)
    );
    if (layer.type === 'shape' && layer.shape.type === 'polygon') {
      layer.shape.strokeColor = [0.9, 0.9, 0.95, 1];
      layer.shape.strokeWidth.defaultValue = 2;
    }

    const newComp = settleComposition(ensureLayerHasTrack(
      { ...composition, layers: [...composition.layers, layer] }, layer
    ));
    const newSel: SelectionState = sel([layer.id], layer.id);

    exec({
      label: 'Create Path',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });

    return layer.id;
  },

  setPathVerticesLive: (layerId, vertices, closed) => {
    const { composition } = get();
    const layers = composition.layers.map((l) => {
      if (l.id !== layerId || l.type !== 'shape' || l.shape.type !== 'polygon') return l;
      const shape = { ...l.shape, vertices, ...(closed !== undefined ? { closed } : {}) };
      return { ...l, shape } as Layer;
    });
    set({ composition: { ...composition, layers } });
  },

  addPathPoint: (layerId, segmentIndex, t) => {
    const { composition } = get();
    const oldComp = composition;
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'shape' || layer.shape.type !== 'polygon') return;

    const verts = layer.shape.vertices;
    const n = verts.length;
    const closed = layer.shape.closed;
    if (segmentIndex < 0 || segmentIndex >= (closed ? n : n - 1)) return;

    const a = verts[segmentIndex];
    const b = verts[(segmentIndex + 1) % n];
    const newVerts = insertPointOnSegment(verts, segmentIndex, a, b, t, closed);
    if (!newVerts) return;

    const newLayers = composition.layers.map((l) =>
      l.id === layerId && l.type === 'shape' && l.shape.type === 'polygon'
        ? ({ ...l, shape: { ...l.shape, vertices: newVerts } } as Layer)
        : l
    );

    exec({
      label: 'Add Point',
      execute: () => { set({ composition: { ...get().composition, layers: newLayers } }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  deletePathPoint: (layerId, vertexIndex) => {
    const { composition } = get();
    const oldComp = composition;
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'shape' || layer.shape.type !== 'polygon') return;

    const verts = layer.shape.vertices;
    if (verts.length <= 2) return; // keep at least a segment
    if (vertexIndex < 0 || vertexIndex >= verts.length) return;

    const newVerts = verts.filter((_, i) => i !== vertexIndex);

    const newLayers = composition.layers.map((l) =>
      l.id === layerId && l.type === 'shape' && l.shape.type === 'polygon'
        ? ({ ...l, shape: { ...l.shape, vertices: newVerts } } as Layer)
        : l
    );

    exec({
      label: 'Delete Point',
      execute: () => { set({ composition: { ...get().composition, layers: newLayers } }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  setPathVertexType: (layerId, vertexIndex, type) => {
    const { composition } = get();
    const oldComp = composition;
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'shape' || layer.shape.type !== 'polygon') return;

    const verts = layer.shape.vertices;
    if (vertexIndex < 0 || vertexIndex >= verts.length) return;

    const newVerts = applyVertexType(verts, vertexIndex, type, layer.shape.closed);

    const newLayers = composition.layers.map((l) =>
      l.id === layerId && l.type === 'shape' && l.shape.type === 'polygon'
        ? ({ ...l, shape: { ...l.shape, vertices: newVerts } } as Layer)
        : l
    );

    exec({
      label: 'Convert Point',
      execute: () => { set({ composition: { ...get().composition, layers: newLayers } }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  addMotionPath: (layerId) => {
    const { composition } = get();
    const oldComp = composition;
    const path = createMotionPath(layerId, composition.settings.durationFrames);
    const newComp = { ...composition, motionPaths: [...(composition.motionPaths || []), path] };
    exec({
      label: 'Add Motion Path',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  removeMotionPath: (pathId) => {
    const { composition } = get();
    const oldComp = composition;
    const newComp = { ...composition, motionPaths: (composition.motionPaths || []).filter((p) => p.id !== pathId) };
    exec({
      label: 'Remove Motion Path',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updateMotionPath: (pathId, updates) => {
    const { composition } = get();
    const history = useHistoryStore.getState();
    if (history.isUndoing || history.isBatching) {
      const newPaths = (composition.motionPaths || []).map((p) =>
        p.id === pathId ? { ...p, ...updates } : p
      );
      set({ composition: { ...composition, motionPaths: newPaths } });
      return;
    }
    const oldComp = composition;
    const newPaths = (composition.motionPaths || []).map((p) =>
      p.id === pathId ? { ...p, ...updates } : p
    );
    const newComp = { ...composition, motionPaths: newPaths };
    exec({
      label: 'Update Motion Path',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  addProceduralBinding: (layerId, presetName) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const preset = PROCEDURAL_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    const durationFrames = layer.outPoint - layer.inPoint;
    const binding = preset.create(layerId, durationFrames);
    const oldComp = composition;
    const existing = (composition.proceduralBindings || []).filter((b) => b.layerId !== layerId);
    const newComp = { ...composition, proceduralBindings: [...existing, binding] };
    exec({
      label: 'Add Procedural Loop',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  removeProceduralBinding: (bindingId) => {
    const { composition } = get();
    const oldComp = composition;
    const newComp = { ...composition, proceduralBindings: (composition.proceduralBindings || []).filter((b) => b.id !== bindingId) };
    exec({
      label: 'Remove Procedural Loop',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updateProceduralBinding: (bindingId, updates) => {
    const { composition } = get();
    const history = useHistoryStore.getState();
    if (history.isUndoing || history.isBatching) {
      const newBindings = (composition.proceduralBindings || []).map((b) =>
        b.id === bindingId ? { ...b, ...updates } : b
      );
      set({ composition: { ...composition, proceduralBindings: newBindings } });
      return;
    }
    const oldComp = composition;
    const newBindings = (composition.proceduralBindings || []).map((b) =>
      b.id === bindingId ? { ...b, ...updates } : b
    );
    const newComp = { ...composition, proceduralBindings: newBindings };
    exec({
      label: 'Update Procedural Loop',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  addAnchorEdge: (sourceLayerId, targetLayerId) => {
    const { composition } = get();
    const sourceLayer = composition.layers.find((l) => l.id === sourceLayerId);
    const targetLayer = composition.layers.find((l) => l.id === targetLayerId);
    if (!sourceLayer || !targetLayer) return;
    const graph = new AnchorGraph();
    graph.rebuild(composition.anchorEdges || []);
    if (graph.wouldCycle(sourceLayerId, targetLayerId)) return;
    const edge: AnchorEdge = {
      id: uid(),
      sourceLayerId,
      targetLayerId,
      enabled: true,
      mappings: [{
        sourceProperty: 'positionX',
        targetProperty: 'positionX',
        transfer: { type: 'direct', scale: 1, offset: 0, clampMin: -Infinity, clampMax: Infinity },
      }, {
        sourceProperty: 'positionY',
        targetProperty: 'positionY',
        transfer: { type: 'direct', scale: 1, offset: 0, clampMin: -Infinity, clampMax: Infinity },
      }],
    };
    const oldComp = composition;
    const newComp = { ...composition, anchorEdges: [...(composition.anchorEdges || []), edge] };
    exec({
      label: 'Add Anchor Edge',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  removeAnchorEdge: (edgeId) => {
    const { composition } = get();
    const oldComp = composition;
    const newComp = { ...composition, anchorEdges: (composition.anchorEdges || []).filter((e) => e.id !== edgeId) };
    exec({
      label: 'Remove Anchor Edge',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updateAnchorEdge: (edgeId, updates) => {
    const { composition } = get();
    const oldComp = composition;
    const newEdges = (composition.anchorEdges || []).map((e) =>
      e.id === edgeId ? { ...e, ...updates } : e
    );
    const newComp = { ...composition, anchorEdges: newEdges };
    exec({
      label: 'Update Anchor Edge',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  addPhysicsBinding: (layerId, role) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const existing = (composition.physicsBindings || []).find((b) => b.layerId === layerId);
    if (existing) return;
    const binding: PhysicsBindingDef = {
      id: uid(),
      layerId,
      enabled: true,
      role,
      material: { mass: 1, restitution: 0.3, friction: 0.5, lockAxisX: false, lockAxisY: false, lockRotation: false, linearDamping: 0.1, angularDamping: 0.05 },
      collider: { mode: 'boundingBox' },
      birthFrame: layer.inPoint,
      handoff: { velocitySource: 'auto-derive', manualMagnitude: 0, manualAngleDeg: 0, deriveSampleWindow: 3 },
      solidBeforeActivation: false,
    };
    const oldComp = composition;
    const newComp = {
      ...composition,
      physicsBindings: [...(composition.physicsBindings || []), binding],
      physicsWorld: composition.physicsWorld ?? { enabled: true, gravityX: 0, gravityY: 980, timeScale: 1, substeps: 1 },
    };
    invalidatePhysicsCache();
    set({ physicsBakeStatus: 'stale' });
    scheduleAutoBake();
    exec({
      label: 'Add Physics Binding',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  removePhysicsBinding: (bindingId) => {
    const { composition } = get();
    const oldComp = composition;
    const newComp = { ...composition, physicsBindings: (composition.physicsBindings || []).filter((b) => b.id !== bindingId) };
    invalidatePhysicsCache();
    set({ physicsBakeStatus: 'stale' });
    scheduleAutoBake();
    exec({
      label: 'Remove Physics Binding',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updatePhysicsBinding: (bindingId, updates) => {
    const { composition } = get();
    const oldComp = composition;
    const newBindings = (composition.physicsBindings || []).map((b) =>
      b.id === bindingId ? { ...b, ...updates } : b
    );
    const newComp = { ...composition, physicsBindings: newBindings };
    invalidatePhysicsCache();
    set({ physicsBakeStatus: 'stale' });
    scheduleAutoBake();
    exec({
      label: 'Update Physics Binding',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updatePhysicsWorld: (updates) => {
    const { composition } = get();
    const oldComp = composition;
    const currentWorld = composition.physicsWorld ?? { enabled: false, gravityX: 0, gravityY: 980, timeScale: 1, substeps: 1 };
    const newComp = { ...composition, physicsWorld: { ...currentWorld, ...updates } };
    invalidatePhysicsCache();
    set({ physicsBakeStatus: 'stale' });
    scheduleAutoBake();
    exec({
      label: 'Update Physics World',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  bakePhysics: async () => {
    const { composition } = get();
    const bindings = composition.physicsBindings || [];
    const world = composition.physicsWorld;
    if (!world?.enabled || bindings.length === 0) return;

    set({ physicsBakeStatus: 'baking', physicsBakeProgress: 0 });

    const evaluator = buildPhysicsEvaluator(composition);
    const totalFrames = composition.settings.durationFrames;
    const frameRate = composition.settings.frameRate;

    const physicsConfig = {
      enabled: world.enabled,
      gravityX: world.gravityX,
      gravityY: world.gravityY,
      timeScale: world.timeScale,
      substeps: world.substeps,
    };

    const physicsBindings = bindings.map((b) => ({
      id: b.id,
      layerId: b.layerId,
      enabled: b.enabled,
      role: b.role as 'dynamic' | 'kinematic' | 'static' | 'ghost',
      material: b.material,
      collider: b.collider,
      birthFrame: b.birthFrame,
      endFrame: b.endFrame,
      handoff: b.handoff,
      solidBeforeActivation: b.solidBeforeActivation,
    }));

    try {
      await bakePhysicsWorld(
        physicsConfig,
        physicsBindings,
        totalFrames,
        frameRate,
        evaluator,
        composition.settings.width,
        composition.settings.height,
        (frame, total) => {
          set({ physicsBakeProgress: Math.round((frame / total) * 100) });
        },
      );
      set({ physicsBakeStatus: 'done', physicsBakeProgress: 100 });
    } catch (err) {
      console.error('Physics bake failed:', err);
      set({ physicsBakeStatus: 'idle', physicsBakeProgress: 0 });
    }
  },

  addStaggerBinding: (_targetLayerIds, config) => {
    const { composition } = get();
    const oldComp = composition;
    const newComp = { ...composition, staggerBindings: [...(composition.staggerBindings || []), config] };
    exec({
      label: 'Add Stagger Binding',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  removeStaggerBinding: (bindingId) => {
    const { composition } = get();
    const oldComp = composition;
    const newComp = { ...composition, staggerBindings: (composition.staggerBindings || []).filter((b) => b.id !== bindingId) };
    exec({
      label: 'Remove Stagger Binding',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updateStaggerBinding: (bindingId, updates) => {
    const { composition } = get();
    const oldComp = composition;
    const newBindings = (composition.staggerBindings || []).map((b) =>
      b.id === bindingId ? { ...b, ...updates } : b
    );
    const newComp = { ...composition, staggerBindings: newBindings };
    exec({
      label: 'Update Stagger Binding',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  applyStaggerOffsets: (_bindingId, offsets) => {
    const { composition } = get();
    const oldComp = composition;

    // First pass: apply timing offsets to all affected layers.
    let newLayers = composition.layers.map((layer) => {
      const offset = offsets.get(layer.id);
      if (offset === undefined || offset === 0) return layer;
      const duration = layer.outPoint - layer.inPoint;
      return { ...layer, inPoint: layer.inPoint + offset, outPoint: layer.inPoint + offset + duration };
    });

    // Second pass: resolve overlaps. For each staggered layer, if it now
    // overlaps another clip on its track, find a compatible track that has
    // space — or create a new one.
    let newTracks = [...composition.tracks];
    const staggeredIds = new Set(
      [...offsets.entries()].filter(([, v]) => v !== 0).map(([id]) => id)
    );

    for (let i = 0; i < newLayers.length; i++) {
      const layer = newLayers[i];
      if (!staggeredIds.has(layer.id)) continue;
      if (!layer.trackId) continue;

      const overlaps = !canPlaceClipOnTrack(newLayers, layer.trackId, layer.id, layer.inPoint, layer.outPoint);
      if (!overlaps) continue;

      // Try to find an existing compatible track with space.
      const fitTrackId = findFirstFit(newLayers, newTracks, layer.type, layer.inPoint, layer.outPoint, layer.id);
      if (fitTrackId) {
        newLayers = newLayers.map((l) => l.id === layer.id ? { ...l, trackId: fitTrackId } : l);
      } else {
        // Create a new track for this layer type.
        const trackType = layerTypeToTrackType(layer.type);
        const maxOrder = newTracks.length > 0 ? Math.max(...newTracks.map((t) => t.order)) : -1;
        const newTrack = createTrack(`${layer.type} track`, trackType, maxOrder + 1);
        newTracks = [...newTracks, newTrack];
        newLayers = newLayers.map((l) => l.id === layer.id ? { ...l, trackId: newTrack.id } : l);
      }
    }

    const newComp = settleComposition({ ...composition, layers: newLayers, tracks: newTracks });
    exec({
      label: 'Apply Stagger Offsets',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  addMask: (layerId, type) => {
    const { composition, selection } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer || !layerSupportsMasks(layer)) return;
    const oldComp = composition;
    const oldSel = selection;

    const cw = composition.settings.width;
    const ch = composition.settings.height;
    const pos = layer.transform.position.defaultValue;
    const cx = Array.isArray(pos) ? pos[0] : cw / 2;
    const cy = Array.isArray(pos) ? pos[1] : ch / 2;
    const mask = createMask(type, cx, cy, cw * 0.4, ch * 0.4);

    const newLayers = composition.layers.map((l) => {
      if (l.id !== layerId) return l;
      const existing = 'masks' in l && Array.isArray(l.masks) ? l.masks : [];
      return { ...l, masks: [...existing, mask] } as Layer;
    });
    const newComp = { ...composition, layers: newLayers };
    const newSel = sel([layerId], layerId);

    exec({
      label: 'Add Mask',
      execute: () => { set({ composition: newComp, selection: newSel }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  removeMask: (layerId, maskId) => {
    const { composition } = get();
    const oldComp = composition;
    const newLayers = composition.layers.map((l) => {
      if (l.id !== layerId || !('masks' in l) || !Array.isArray(l.masks)) return l;
      return { ...l, masks: l.masks.filter((m) => m.id !== maskId) } as Layer;
    });
    const newComp = { ...composition, layers: newLayers };
    exec({
      label: 'Remove Mask',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updateMaskProperty: (layerId, maskId, path, value) => {
    const apply = (comp: Composition): Composition => {
      const layers = comp.layers.map((l) => {
        if (l.id !== layerId || !('masks' in l) || !Array.isArray(l.masks)) return l;
        const masks = l.masks.map((m) => (m.id === maskId ? (deepSet(m, path, value) as Mask) : m));
        return { ...l, masks } as Layer;
      });
      return { ...comp, layers };
    };

    const history = useHistoryStore.getState();
    if (history.isUndoing || history.isBatching) {
      set({ composition: apply(get().composition) });
      return;
    }
    const oldComp = get().composition;
    const newComp = apply(oldComp);
    exec({
      label: 'Update Mask',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  addMaskKeyframe: (layerId, maskId, propertyPath, frame, value) => {
    const apply = (comp: Composition): Composition => {
      const layers = comp.layers.map((l) => {
        if (l.id !== layerId || !('masks' in l) || !Array.isArray(l.masks)) return l;
        const masks = l.masks.map((m) => {
          if (m.id !== maskId) return m;
          const prop = deepGet(m, propertyPath) as AnimatableProperty;
          if (!prop || !prop.keyframes) return m;
          const existing = prop.keyframes.findIndex((k: Keyframe) => k.frame === frame);
          let newKeyframes: Keyframe[];
          if (existing >= 0) {
            newKeyframes = prop.keyframes.map((k: Keyframe, i: number) => (i === existing ? { ...k, value } : k));
          } else {
            newKeyframes = [...prop.keyframes, createKeyframe(frame, value)].sort((a, b) => a.frame - b.frame);
          }
          return deepSet(m, `${propertyPath}.keyframes`, newKeyframes) as Mask;
        });
        return { ...l, masks } as Layer;
      });
      return { ...comp, layers };
    };

    const history = useHistoryStore.getState();
    if (history.isUndoing || history.isBatching) {
      set({ composition: apply(get().composition) });
      return;
    }
    const oldComp = get().composition;
    const newComp = apply(oldComp);
    exec({
      label: 'Add Mask Keyframe',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  duplicateMask: (layerId, maskId) => {
    const oldComp = get().composition;
    const layers = oldComp.layers.map((l) => {
      if (l.id !== layerId || !('masks' in l) || !Array.isArray(l.masks)) return l;
      const idx = l.masks.findIndex((m) => m.id === maskId);
      if (idx < 0) return l;
      const clone = JSON.parse(JSON.stringify(l.masks[idx])) as Mask;
      clone.id = uid();
      clone.name = clone.name + ' Copy';
      const masks = [...l.masks];
      masks.splice(idx + 1, 0, clone);
      return { ...l, masks } as Layer;
    });
    const newComp = { ...oldComp, layers };
    exec({
      label: 'Duplicate Mask',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  reorderMask: (layerId, maskId, direction) => {
    const oldComp = get().composition;
    const layers = oldComp.layers.map((l) => {
      if (l.id !== layerId || !('masks' in l) || !Array.isArray(l.masks)) return l;
      const idx = l.masks.findIndex((m) => m.id === maskId);
      if (idx < 0) return l;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= l.masks.length) return l;
      const masks = [...l.masks];
      [masks[idx], masks[newIdx]] = [masks[newIdx], masks[idx]];
      return { ...l, masks } as Layer;
    });
    const newComp = { ...oldComp, layers };
    exec({
      label: 'Reorder Mask',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  addBackgroundLayer: () => {
    const { composition } = get();
    if (composition.background.layers.length >= 10) return;
    const oldComp = composition;
    const newLayer = createBackgroundLayer();
    const newComp = {
      ...composition,
      background: { layers: [...composition.background.layers, newLayer] },
    };
    exec({
      label: 'Add Background Layer',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  removeBackgroundLayer: (id) => {
    const { composition } = get();
    if (composition.background.layers.length <= 1) return;
    const oldComp = composition;
    const newComp = {
      ...composition,
      background: { layers: composition.background.layers.filter((l) => l.id !== id) },
    };
    exec({
      label: 'Remove Background Layer',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  updateBackgroundLayer: (id, updates) => {
    const { composition } = get();
    const oldComp = composition;
    const newLayers = composition.background.layers.map((l) =>
      l.id === id ? { ...l, ...updates } : l
    );
    const newComp = { ...composition, background: { layers: newLayers } };
    exec({
      label: 'Update Background',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  reorderBackgroundLayer: (id, direction) => {
    const { composition } = get();
    const oldComp = composition;
    const layers = [...composition.background.layers];
    const idx = layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= layers.length) return;
    [layers[idx], layers[targetIdx]] = [layers[targetIdx], layers[idx]];
    const newComp = { ...composition, background: { layers } };
    exec({
      label: 'Reorder Background',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  reorderLayers: (sourceIds, targetIndex) => {
    const { composition } = get();
    const oldComp = composition;

    const layers = [...composition.layers];
    const sourceSet = new Set(sourceIds);
    const movedLayers = layers.filter((l) => sourceSet.has(l.id));
    if (movedLayers.length === 0) return;

    const remaining = layers.filter((l) => !sourceSet.has(l.id));
    const clampedIndex = Math.max(0, Math.min(targetIndex, remaining.length));
    const newLayers = [
      ...remaining.slice(0, clampedIndex),
      ...movedLayers,
      ...remaining.slice(clampedIndex),
    ];

    const newComp = { ...composition, layers: newLayers };

    exec({
      label: 'Reorder Layers',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  moveClipInTime: (layerId, newInPoint) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const duration = layer.outPoint - layer.inPoint;
    // No upper wall — the timeline expands to fit. Only floor at 0.
    const clamped = Math.max(0, newInPoint);
    const newOutPoint = clamped + duration;

    if (layer.trackId) {
      if (!canPlaceClipOnTrack(composition.layers, layer.trackId, layerId, clamped, newOutPoint)) return;
    }

    const oldComp = composition;
    const newLayers = composition.layers.map((l) =>
      l.id === layerId ? { ...l, inPoint: clamped, outPoint: newOutPoint } : l
    );
    const newComp2 = settleComposition({ ...composition, layers: newLayers });

    exec({
      label: 'Move Clip',
      execute: () => { set({ composition: newComp2 }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  moveClipToTrack: (layerId, targetTrackId, newInPoint) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const inPt = newInPoint ?? layer.inPoint;
    const duration = layer.outPoint - layer.inPoint;
    const outPt = inPt + duration;

    if (!canPlaceClipOnTrack(composition.layers, targetTrackId, layerId, inPt, outPt)) return;

    const oldComp = composition;
    const newLayers = composition.layers.map((l) =>
      l.id === layerId ? { ...l, trackId: targetTrackId, inPoint: inPt, outPoint: outPt } : l
    );
    const newComp2 = settleComposition({ ...composition, layers: newLayers });

    exec({
      label: 'Move to Track',
      execute: () => { set({ composition: newComp2 }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  reorderClipToTrackPosition: (layerId, targetOrder, newInPoint) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const inPt = newInPoint ?? layer.inPoint;
    const duration = layer.outPoint - layer.inPoint;
    const outPt = inPt + duration;

    const oldComp = composition;
    const sourceTrackId = layer.trackId;

    // Create a new track at the desired order position
    const newTrack = createTrack(`${layer.type} track`, layerTypeToTrackType(layer.type), targetOrder);

    // Reassign orders: shift existing tracks to make space
    const reorderedTracks = composition.tracks.map((t) => {
      if (t.id === sourceTrackId) return t;
      if (t.order >= targetOrder) return { ...t, order: t.order + 1 };
      return t;
    });
    reorderedTracks.push(newTrack);

    // Move the layer to the new track
    const newLayers = composition.layers.map((l) =>
      l.id === layerId ? { ...l, trackId: newTrack.id, inPoint: inPt, outPoint: outPt } : l
    );

    // Remove old track if it's now empty
    const sourceStillUsed = newLayers.some((l) => l.trackId === sourceTrackId && l.id !== layerId);
    const finalTracks = sourceStillUsed
      ? reorderedTracks
      : reorderedTracks.filter((t) => t.id !== sourceTrackId);

    const newComp = settleComposition({ ...composition, tracks: finalTracks, layers: newLayers });

    exec({
      label: 'Reorder Clip',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  canPlaceOnTrack: (layerId, trackId, inPoint, outPoint) => {
    const { composition } = get();
    return canPlaceClipOnTrack(composition.layers, trackId, layerId, inPoint, outPoint);
  },

  // Group resize: every selected clip moves the dragged edge by ONE shared
  // delta. The delta is re-clamped here against the live composition (the most
  // restrictive clip wins) so the commit can never produce an overlap, then the
  // whole change lands as a single undoable, single-settle operation.
  resizeClips: (layerIds, edge, requestedDelta) => {
    const { composition } = get();
    const ids = layerIds.filter((id) => composition.layers.some((l) => l.id === id));
    if (ids.length === 0) return;

    const delta = clampGroupResizeDelta(composition.layers, ids, edge, requestedDelta);
    if (delta === 0) return;

    const idSet = new Set(ids);
    const oldComp = composition;
    const newLayers = composition.layers.map((l) => {
      if (!idSet.has(l.id)) return l;
      const t = applyResizeDelta({ inPoint: l.inPoint, outPoint: l.outPoint }, edge, delta);
      const inPt = Math.max(0, Math.round(t.inPoint));
      const outPt = Math.max(inPt + 1, Math.round(t.outPoint));
      return { ...l, inPoint: inPt, outPoint: outPt };
    });
    const newComp = settleComposition({ ...composition, layers: newLayers });

    exec({
      label: ids.length > 1 ? 'Resize Clips' : 'Resize Clip',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  commitClipMove: (layerId, intent) => {
    const { composition } = get();
    const layer = composition.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const oldComp = composition;
    const duration = layer.outPoint - layer.inPoint;
    const inPt = Math.max(0, Math.round('inPoint' in intent ? intent.inPoint : 0));
    const outPt = inPt + duration;

    let newLayers = composition.layers;
    let newTracks = composition.tracks;

    if (intent.kind === 'sameTrack') {
      // No-op when nothing moved; reject if the slot is taken.
      if (inPt === layer.inPoint) return;
      if (layer.trackId && !canPlaceClipOnTrack(composition.layers, layer.trackId, layerId, inPt, outPt)) return;
      newLayers = composition.layers.map((l) =>
        l.id === layerId ? { ...l, inPoint: inPt, outPoint: outPt } : l
      );
    } else if (intent.kind === 'existingTrack') {
      // Reject when destination track conflicts; allow same-track drops to
      // collapse into a sameTrack-style move.
      if (intent.trackId === layer.trackId && inPt === layer.inPoint) return;
      if (!canPlaceClipOnTrack(composition.layers, intent.trackId, layerId, inPt, outPt)) return;
      newLayers = composition.layers.map((l) =>
        l.id === layerId ? { ...l, trackId: intent.trackId, inPoint: inPt, outPoint: outPt } : l
      );
    } else if (intent.kind === 'compressedInsert') {
      // Drop onto a compressed track: order is what matters, not the timestamp.
      // We assign a fractional sort key so the clip lands at insertIndex, then
      // settleComposition's reflow snaps every clip to gapless integer
      // positions. No overlap check — reflow resolves collisions by design.
      const trackClips = composition.layers
        .filter((l) => l.trackId === intent.trackId && l.id !== layerId)
        .sort((a, b) => a.inPoint - b.inPoint);
      const i = Math.max(0, Math.min(intent.insertIndex, trackClips.length));
      let sortKey: number;
      if (trackClips.length === 0) sortKey = 0;
      else if (i >= trackClips.length) sortKey = trackClips[trackClips.length - 1].outPoint + 1;
      else sortKey = trackClips[i].inPoint - 0.5;
      newLayers = composition.layers.map((l) =>
        l.id === layerId ? { ...l, trackId: intent.trackId, inPoint: sortKey, outPoint: sortKey + duration } : l
      );
    } else {
      // newTrack: insert a fresh track at the given order, shifting siblings down.
      const newTrack = createTrack(`${layer.type} track`, layerTypeToTrackType(layer.type), intent.insertOrder);
      newTracks = [
        ...composition.tracks.map((t) =>
          t.order >= intent.insertOrder ? { ...t, order: t.order + 1 } : t
        ),
        newTrack,
      ];
      newLayers = composition.layers.map((l) =>
        l.id === layerId ? { ...l, trackId: newTrack.id, inPoint: inPt, outPoint: outPt } : l
      );
    }

    const newComp = settleComposition({ ...composition, layers: newLayers, tracks: newTracks });
    if (newComp === composition) return;

    // Compressed inserts always allocate fresh layer objects (fractional sort
    // key), so reference equality can't detect a no-op reorder. Compare the
    // resulting layout instead and skip the history entry when unchanged.
    if (intent.kind === 'compressedInsert') {
      const unchanged = newComp.layers.every((nl) => {
        const ol = composition.layers.find((o) => o.id === nl.id);
        return ol && ol.trackId === nl.trackId && ol.inPoint === nl.inPoint && ol.outPoint === nl.outPoint;
      });
      if (unchanged) return;
    }

    exec({
      label: 'Move Clip',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  toggleTrackVisibility: (trackId) => {
    const { composition } = get();
    const track = composition.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const oldComp = composition;
    const next = !track.visible;
    const tracks = composition.tracks.map((t) =>
      t.id === trackId ? { ...t, visible: next } : t
    );
    const newComp = { ...composition, tracks };

    exec({
      label: next ? 'Show Track' : 'Hide Track',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  toggleTrackMute: (trackId) => {
    const { composition } = get();
    const track = composition.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const oldComp = composition;
    const next = !track.muted;
    const tracks = composition.tracks.map((t) =>
      t.id === trackId ? { ...t, muted: next } : t
    );
    const newComp = { ...composition, tracks };

    exec({
      label: next ? 'Mute Track' : 'Unmute Track',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  toggleTrackCompression: (trackId) => {
    const { composition } = get();
    const track = composition.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const oldComp = composition;
    const next = !isTrackCompressed(track);
    const tracks = composition.tracks.map((t) =>
      t.id === trackId ? { ...t, compressed: next } : t
    );
    const newComp = settleComposition({ ...composition, tracks });

    exec({
      label: next ? 'Compress Track' : 'Uncompress Track',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  trimSplit: (layerId) => {
    const { composition, selection } = get();
    const currentFrame = playbackController.currentFrame;
    const targetIds = layerId ? [layerId] : selection.selectedIds.length > 0 ? [...selection.selectedIds] : [];
    if (targetIds.length === 0) return;

    const oldComp = composition;
    const oldSel = selection;
    let comp = composition;
    const newSelectIds: string[] = [];
    for (const id of targetIds) {
      const result = executeTrim(comp, id, currentFrame, 'split');
      if (result) {
        comp = result.newComp;
        newSelectIds.push(result.selectId);
      } else {
        newSelectIds.push(id);
      }
    }
    if (comp === composition) return;
    const newComp = settleComposition(comp);

    exec({
      label: targetIds.length > 1 ? 'Split Clips' : 'Split Clip',
      execute: () => { set({ composition: newComp, selection: sel(newSelectIds) }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  trimLeft: (layerId) => {
    const { composition, selection } = get();
    const currentFrame = playbackController.currentFrame;
    const targetIds = layerId ? [layerId] : selection.selectedIds.length > 0 ? [...selection.selectedIds] : [];
    if (targetIds.length === 0) return;

    const oldComp = composition;
    const oldSel = selection;
    let comp = composition;
    for (const id of targetIds) {
      const result = executeTrim(comp, id, currentFrame, 'left');
      if (result) comp = result.newComp;
    }
    if (comp === composition) return;
    const newComp = settleComposition(comp);

    exec({
      label: targetIds.length > 1 ? 'Trim Left (Batch)' : 'Trim Left',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  trimRight: (layerId) => {
    const { composition, selection } = get();
    const currentFrame = playbackController.currentFrame;
    const targetIds = layerId ? [layerId] : selection.selectedIds.length > 0 ? [...selection.selectedIds] : [];
    if (targetIds.length === 0) return;

    const oldComp = composition;
    const oldSel = selection;
    let comp = composition;
    for (const id of targetIds) {
      const result = executeTrim(comp, id, currentFrame, 'right');
      if (result) comp = result.newComp;
    }
    if (comp === composition) return;
    const newComp = settleComposition(comp);

    exec({
      label: targetIds.length > 1 ? 'Trim Right (Batch)' : 'Trim Right',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  trimCutUp: (layerId) => {
    const { composition, selection } = get();
    const currentFrame = playbackController.currentFrame;
    const targetIds = layerId ? [layerId] : selection.selectedIds.length > 0 ? [...selection.selectedIds] : [];
    if (targetIds.length === 0) return;

    const oldComp = composition;
    const oldSel = selection;
    let comp = composition;
    const newSelectIds: string[] = [];
    for (const id of targetIds) {
      const result = executeTrim(comp, id, currentFrame, 'cutUp');
      if (result) {
        comp = result.newComp;
        newSelectIds.push(result.selectId);
      } else {
        newSelectIds.push(id);
      }
    }
    if (comp === composition) return;
    const newComp = settleComposition(comp);

    exec({
      label: targetIds.length > 1 ? 'Cut Up (Batch)' : 'Cut Up',
      execute: () => { set({ composition: newComp, selection: sel(newSelectIds) }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  trimCutDown: (layerId) => {
    const { composition, selection } = get();
    const currentFrame = playbackController.currentFrame;
    const targetIds = layerId ? [layerId] : selection.selectedIds.length > 0 ? [...selection.selectedIds] : [];
    if (targetIds.length === 0) return;

    const oldComp = composition;
    const oldSel = selection;
    let comp = composition;
    const newSelectIds: string[] = [];
    for (const id of targetIds) {
      const result = executeTrim(comp, id, currentFrame, 'cutDown');
      if (result) {
        comp = result.newComp;
        newSelectIds.push(result.selectId);
      } else {
        newSelectIds.push(id);
      }
    }
    if (comp === composition) return;
    const newComp = settleComposition(comp);

    exec({
      label: targetIds.length > 1 ? 'Cut Down (Batch)' : 'Cut Down',
      execute: () => { set({ composition: newComp, selection: sel(newSelectIds) }); },
      undo: () => { set({ composition: oldComp, selection: oldSel }); },
    });
  },

  extendToMaxLeft: () => {
    const { composition, selection } = get();
    const ids = selection.selectedIds;
    if (ids.length < 2) return;

    const selectedLayers = composition.layers.filter((l) => ids.includes(l.id));
    if (selectedLayers.length < 2) return;

    const earliestStart = Math.min(...selectedLayers.map((l) => l.inPoint));
    const idSet = new Set(ids);
    const oldComp = composition;
    const newLayers = composition.layers.map((l) => {
      if (!idSet.has(l.id) || l.inPoint === earliestStart) return l;
      return { ...l, inPoint: earliestStart };
    });
    const newComp = settleComposition({ ...composition, layers: newLayers });

    exec({
      label: 'Extend To Max Left',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  extendToMaxRight: () => {
    const { composition, selection } = get();
    const ids = selection.selectedIds;
    if (ids.length < 2) return;

    const selectedLayers = composition.layers.filter((l) => ids.includes(l.id));
    if (selectedLayers.length < 2) return;

    const latestEnd = Math.max(...selectedLayers.map((l) => l.outPoint));
    const idSet = new Set(ids);
    const oldComp = composition;
    const newLayers = composition.layers.map((l) => {
      if (!idSet.has(l.id) || l.outPoint === latestEnd) return l;
      return { ...l, outPoint: latestEnd };
    });
    const newComp = settleComposition({ ...composition, layers: newLayers });

    exec({
      label: 'Extend To Max Right',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  orderClipsAscending: () => {
    const { composition, selection } = get();
    const ids = selection.selectedIds;
    if (ids.length < 2) return;

    const selectedLayers = composition.layers.filter((l) => ids.includes(l.id));
    if (selectedLayers.length < 2) return;

    const oldComp = composition;
    // Sort by layer stack order (array index in layers = stack position)
    const layerIndices = new Map(composition.layers.map((l, i) => [l.id, i]));
    const byStack = [...selectedLayers].sort((a, b) => layerIndices.get(a.id)! - layerIndices.get(b.id)!);
    // Collect sorted inPoints ascending
    const inPoints = [...selectedLayers].map((l) => l.inPoint).sort((a, b) => a - b);
    // Assign inPoints in ascending order to the stack-ordered clips
    const reassignment = new Map<string, number>();
    byStack.forEach((layer, i) => {
      reassignment.set(layer.id, inPoints[i]);
    });

    const newLayers = composition.layers.map((l) => {
      const newIn = reassignment.get(l.id);
      if (newIn === undefined || newIn === l.inPoint) return l;
      const duration = l.outPoint - l.inPoint;
      return { ...l, inPoint: newIn, outPoint: newIn + duration };
    });
    const newComp = settleComposition({ ...composition, layers: newLayers });

    exec({
      label: 'Order Clips Ascending',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },

  orderClipsDescending: () => {
    const { composition, selection } = get();
    const ids = selection.selectedIds;
    if (ids.length < 2) return;

    const selectedLayers = composition.layers.filter((l) => ids.includes(l.id));
    if (selectedLayers.length < 2) return;

    const oldComp = composition;
    const layerIndices = new Map(composition.layers.map((l, i) => [l.id, i]));
    const byStack = [...selectedLayers].sort((a, b) => layerIndices.get(a.id)! - layerIndices.get(b.id)!);
    // Collect sorted inPoints descending
    const inPoints = [...selectedLayers].map((l) => l.inPoint).sort((a, b) => b - a);
    const reassignment = new Map<string, number>();
    byStack.forEach((layer, i) => {
      reassignment.set(layer.id, inPoints[i]);
    });

    const newLayers = composition.layers.map((l) => {
      const newIn = reassignment.get(l.id);
      if (newIn === undefined || newIn === l.inPoint) return l;
      const duration = l.outPoint - l.inPoint;
      return { ...l, inPoint: newIn, outPoint: newIn + duration };
    });
    const newComp = settleComposition({ ...composition, layers: newLayers });

    exec({
      label: 'Order Clips Descending',
      execute: () => { set({ composition: newComp }); },
      undo: () => { set({ composition: oldComp }); },
    });
  },
}));

function deepGet(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// Immutable set at `key` on either an object or an array. Arrays MUST be cloned
// via slice() with a numeric index — spreading an array into `{...arr}` would
// corrupt it into an index-keyed object (breaks `effects.0.params.1` paths).
function cloneWith(container: unknown, key: string, value: unknown): unknown {
  if (Array.isArray(container)) {
    const arr = container.slice();
    arr[Number(key)] = value;
    return arr;
  }
  return { ...(container as Record<string, unknown>), [key]: value };
}

function deepSet(obj: unknown, path: string, value: unknown): unknown {
  const keys = path.split('.');
  if (keys.length === 0) return value;
  const [head, ...rest] = keys;
  if (rest.length === 0) {
    return cloneWith(obj, head, value);
  }
  const child = Array.isArray(obj)
    ? (obj as unknown[])[Number(head)]
    : (obj as Record<string, unknown>)[head];
  return cloneWith(obj, head, deepSet(child, rest.join('.'), value));
}

// ─── Vector path geometry helpers ───

function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Insert a point on the cubic segment between vertices a and b at parameter t,
// updating only the local segment (a.handleOut, b.handleIn) via De Casteljau.
// Straight segments (no handles) stay straight — a plain corner is inserted.
function insertPointOnSegment(
  verts: PathVertex[],
  segIndex: number,
  a: PathVertex,
  b: PathVertex,
  t: number,
  _closed: boolean,
): PathVertex[] | null {
  void _closed;
  const tt = Math.min(0.999, Math.max(0.001, t));

  const straight =
    a.handleOut[0] === 0 && a.handleOut[1] === 0 &&
    b.handleIn[0] === 0 && b.handleIn[1] === 0;

  const out = verts.map((v) => ({
    position: [v.position[0], v.position[1]] as Vec2,
    handleIn: [v.handleIn[0], v.handleIn[1]] as Vec2,
    handleOut: [v.handleOut[0], v.handleOut[1]] as Vec2,
    vertexType: v.vertexType,
  }));

  if (straight) {
    const pos = lerp2(a.position, b.position, tt);
    const newVertex: PathVertex = {
      position: pos,
      handleIn: [0, 0],
      handleOut: [0, 0],
      vertexType: 'corner',
    };
    out.splice(segIndex + 1, 0, newVertex);
    return out;
  }

  const p0 = a.position;
  const p1: Vec2 = [a.position[0] + a.handleOut[0], a.position[1] + a.handleOut[1]];
  const p2: Vec2 = [b.position[0] + b.handleIn[0], b.position[1] + b.handleIn[1]];
  const p3 = b.position;

  const p01 = lerp2(p0, p1, tt);
  const p12 = lerp2(p1, p2, tt);
  const p23 = lerp2(p2, p3, tt);
  const p012 = lerp2(p01, p12, tt);
  const p123 = lerp2(p12, p23, tt);
  const mid = lerp2(p012, p123, tt);

  const ai = segIndex;
  const bi = (segIndex + 1) % out.length;

  out[ai].handleOut = [p01[0] - p0[0], p01[1] - p0[1]];
  out[bi].handleIn = [p23[0] - p3[0], p23[1] - p3[1]];

  const newVertex: PathVertex = {
    position: mid,
    handleIn: [p012[0] - mid[0], p012[1] - mid[1]],
    handleOut: [p123[0] - mid[0], p123[1] - mid[1]],
    vertexType: 'bezier',
  };
  out.splice(segIndex + 1, 0, newVertex);
  return out;
}

// Convert a vertex between corner (no handles) and bezier (auto-tangent handles).
function applyVertexType(
  verts: PathVertex[],
  index: number,
  type: VertexType,
  closed: boolean,
): PathVertex[] {
  const out = verts.map((v) => ({
    position: [v.position[0], v.position[1]] as Vec2,
    handleIn: [v.handleIn[0], v.handleIn[1]] as Vec2,
    handleOut: [v.handleOut[0], v.handleOut[1]] as Vec2,
    vertexType: v.vertexType,
  }));
  const n = out.length;
  const v = out[index];

  if (type === 'corner') {
    v.handleIn = [0, 0];
    v.handleOut = [0, 0];
    v.vertexType = 'corner';
    return out;
  }

  // bezier / smooth: synthesize handles from the neighbour tangent.
  const hasPrev = closed || index > 0;
  const hasNext = closed || index < n - 1;
  const prev = hasPrev ? out[(index - 1 + n) % n].position : v.position;
  const next = hasNext ? out[(index + 1) % n].position : v.position;

  const tx = next[0] - prev[0];
  const ty = next[1] - prev[1];
  const len = Math.hypot(tx, ty) || 1;
  const dirX = tx / len;
  const dirY = ty / len;

  const inLen = hasPrev ? Math.hypot(v.position[0] - prev[0], v.position[1] - prev[1]) / 3 : len / 3;
  const outLen = hasNext ? Math.hypot(next[0] - v.position[0], next[1] - v.position[1]) / 3 : len / 3;

  v.handleIn = [-dirX * inLen, -dirY * inLen];
  v.handleOut = [dirX * outLen, dirY * outLen];
  v.vertexType = type;
  return out;
}
