import type {
  AnimatableProperty,
  Keyframe,
  Vec2,
  Vec4,
  ResolvedTransform,
  ResolvedShape,
  ResolvedText,
  ResolvedVideo,
  ResolvedImage,
  ResolvedLayer,
  ResolvedMask,
  RenderFrame,
  Layer,
  Composition,
  Transform,
  ShapeLayer,
  TextLayer,
  VideoLayer,
  ImageLayer,
  LottieIconLayer,
  Mask,
  PathVertex,
  MotionPath,
  LayoutObjectLayer,
  LayoutContainerLayer,
  Track,
} from './types';
import type { ResolvedMotionBlur, ResolvedShadow, ResolvedBlur, LayerShadow, LayerGlow, LayerBlur, ResolvedGlow } from './types';
import { measureText, getTextLayout, measureAdvance } from '../engine/textAtlas';
import { accumulateGlyphDeltas, type ResolvedTextAnimator } from './textAnimator';
import { decodeCharAt } from './textDecode';
import { totalPathLength, pointAndAngleAt, glyphPathFraction, type TextPathNode } from './textPath';
import { pairTrackMattes, type TrackMatteMode } from './trackMatte';
import { resolveMaskVertices, resolveMaskFeathers } from './maskPath';
import { resolveEffectStack } from './effects/effectStack';
import { evaluateMotionPathAtFrame } from './motionPath';
import { computeInstanceTransforms, selectClonerRenderPath, buildDataBoundSources } from '../cloner';
import type { ClonerLayer } from '../cloner/types';
import { rasterizeField, type FieldGrid } from '../field-sampling/fields';
import { precompLocalFrame, MAX_PRECOMP_DEPTH } from './precomp';
import type { ResolveContext } from './precomp';
import type { Mat4, Vec3 } from './mat4';
import type { CameraLayer } from './types';
import { defaultCamera, cameraFromParams, localModelMatrix, composeWorldMatrix, forwardVector, cubicBezierVec3, type ResolvedCamera } from './camera3d';
import { resolveStyleColor, type StyleLookup } from './styles';
import type { PrecompLayer } from './types';
import { resolveDominantColor, resolveShapeFill, resolveShapePattern, hexToVec4 } from './material';
import { getMotionBlur } from './layerSwitches';
import { evaluateBinding as evaluateProceduralBinding } from '../procedural/engine';
import { evaluateAnimationItem } from '../animation-items/engine';
import { evaluateAnchoring } from '../anchoring/engine';
import { sampleBakedFrame } from '../physics/bake';
import { computeLayout, computeGridLayout } from '../layout/engine';
import type { ChildMeasurement } from '../layout/engine';
import { computeContainerLayout } from '../layout/containerEngine';
import { easeSegment, segmentProgress } from './keyframeEase';
import { positionOnSegment } from './positionPath';
import { evalScalarKeyframes } from './separateDimensions';
import { effectiveShutterAngle, shutterPhaseFraction } from './shutter';
import { linearSourceSeconds, sourceFrameFromSeconds, frameBlendSplit } from './timeRemap';
import { applyResolvedModifiers, evalPathKeyframes, repeaterTransforms, type ResolvedShapeModifier, type RepeaterCopy } from './shapeModifiers';
import { expressionManager } from '../expressions/manager';
import type { ExpressionContext, KeyframeData } from '../expressions/types';

// ---------------------------------------------------------------------------
// Expression resolution context. Set before resolving each layer so that
// evaluateProperty can check for active expressions without signature changes.
// ---------------------------------------------------------------------------
let _exprLayerId: string | null = null;

// ---------------------------------------------------------------------------
// Layout offset map. Computed at the start of resolveFrame for any active
// layout containers. Maps childId -> {x, y} offset within the layout.
// ---------------------------------------------------------------------------
let _layoutOffsets: Map<string, { x: number; y: number; rotation?: number }> = new Map();
let _layoutContainerSizes: Map<string, { width: number; height: number }> = new Map();
// Layer-by-id lookup used by the per-layer helpers (parenting/group-visibility) for
// O(1) map hits instead of O(N) linear scans. Populated from the structural cache at
// the top of resolveFrame (and by buildPhysicsEvaluator for its out-of-resolveFrame
// use). Saved/restored around the precomp recursion like the layout maps.
let _layerById: Map<string, Layer> = new Map();

// ---------------------------------------------------------------------------
// Structural cache: the frame-INDEPENDENT data resolveFrame would otherwise rebuild
// every frame - the id map, the render-order sort, and the track lookup sets. Keyed
// on the `layers` array reference (WeakMap → auto-evicts when the composition is
// edited) and validated against the `tracks` reference, since a track-only edit
// (e.g. toggling solo) keeps the same layers array but must still invalidate. During
// playback the composition ref is stable between edits, so this collapses a per-frame
// O(N log N)+O(N) rebuild to a single map hit.
// ---------------------------------------------------------------------------
interface StructuralCache {
  tracksRef: Track[];
  layerById: Map<string, Layer>;
  sortedLayers: Layer[];
  hiddenTrackIds: Set<string>;
  soloTrackIds: Set<string>;
  soloing: boolean;
  hasLayoutLayers: boolean;
  hasThreeDLayers: boolean;
}
const _structCacheByLayers = new WeakMap<Layer[], StructuralCache>();

function getStructuralCache(layers: Layer[], tracks: Track[]): StructuralCache {
  const hit = _structCacheByLayers.get(layers);
  if (hit && hit.tracksRef === tracks) return hit;
  const trackOrderMap = new Map(tracks.map((t) => [t.id, t.order]));
  const soloTrackIds = new Set(tracks.filter((t) => t.solo).map((t) => t.id));
  const cache: StructuralCache = {
    tracksRef: tracks,
    layerById: new Map(layers.map((l) => [l.id, l])),
    // Highest track order first (top tracks render last / on top); ties break by
    // clip in-point so abutting multi-clip lanes stack deterministically.
    sortedLayers: [...layers].sort((a, b) => {
      const orderA = a.trackId ? (trackOrderMap.get(a.trackId) ?? 0) : 0;
      const orderB = b.trackId ? (trackOrderMap.get(b.trackId) ?? 0) : 0;
      if (orderA !== orderB) return orderB - orderA;
      return a.inPoint - b.inPoint;
    }),
    hiddenTrackIds: new Set(tracks.filter((t) => !t.visible).map((t) => t.id)),
    soloTrackIds,
    soloing: soloTrackIds.size > 0,
    hasLayoutLayers: layers.some(
      (l) => l.type === 'hbox' || l.type === 'vbox' || l.type === 'grid' || l.type === 'layoutContainer',
    ),
    // 2.5D - skip the per-frame world-matrix pass entirely for all-2D comps (the common case).
    hasThreeDLayers: layers.some((l) => l.is3D === true),
  };
  _structCacheByLayers.set(layers, cache);
  return cache;
}
let _exprFrame = 0;
let _exprFps = 30;
let _exprLayerIndex = 0;
let _exprLayerInPoint = 0;
let _exprLayerOutPoint = 0;
let _exprDuration = 0;
let _exprWidth = 0;
let _exprHeight = 0;

function setExpressionContext(
  layerId: string,
  frame: number,
  fps: number,
  index: number,
  inPoint: number,
  outPoint: number,
  duration: number,
  width: number,
  height: number,
): void {
  _exprLayerId = layerId;
  _exprFrame = frame;
  _exprFps = fps;
  _exprLayerIndex = index;
  _exprLayerInPoint = inPoint;
  _exprLayerOutPoint = outPoint;
  _exprDuration = duration;
  _exprWidth = width;
  _exprHeight = height;
}

function clearExpressionContext(): void {
  _exprLayerId = null;
}

function tryExpression(prop: AnimatableProperty, keyframedValue: number | Vec2): number | Vec2 {
  if (!_exprLayerId) return keyframedValue;
  if (!expressionManager.hasActiveExpression(_exprLayerId, prop.name)) return keyframedValue;

  const keyframes: KeyframeData[] = prop.keyframes.map((kf) => ({
    frame: kf.frame,
    value: kf.value,
  }));

  const context: ExpressionContext = {
    frame: _exprFrame,
    fps: _exprFps,
    time: _exprFrame / _exprFps,
    value: keyframedValue,
    index: _exprLayerIndex,
    duration: _exprDuration / _exprFps,
    width: _exprWidth,
    height: _exprHeight,
    layerInPoint: _exprLayerInPoint,
    layerOutPoint: _exprLayerOutPoint,
    keyframes,
    propertyPath: prop.name,
  };

  const result = expressionManager.evaluate(_exprLayerId, prop.name, context);
  if (result === null) return keyframedValue;
  return result as number | Vec2;
}


function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// Per-segment temporal easing lives in ONE place (core/keyframeEase) so the renderer and the graph
// editor can never disagree on a curve. A bezier segment reads prev.handleOut + next.handleIn (AE
// convention); a named `easing` (elastic/bounce/back/…) overrides the handles.
function interpolateValue(
  from: number,
  to: number,
  t: number,
  prevKf: Keyframe,
  nextKf: Keyframe
): number {
  return easeSegment(from, to, t, prevKf, nextKf);
}

export function evaluateProperty(prop: AnimatableProperty, frame: number): number | Vec2 {
  if (!prop) return 0;
  // Separate Dimensions: X and Y each evaluate from their own scalar keyframe list. Centralised here
  // so every caller (inspector, overlays, snapping, renderer) gets the separated position for free.
  if (prop.valueType === 'vec2' && prop.separated) {
    const def = prop.defaultValue as Vec2;
    const sep: Vec2 = [evalScalarKeyframes(prop.keyframesX, def[0], frame), evalScalarKeyframes(prop.keyframesY, def[1], frame)];
    return tryExpression(prop, sep);
  }
  const { keyframes, defaultValue } = prop;

  let keyframedValue: number | Vec2;

  if (keyframes.length === 0) {
    keyframedValue = defaultValue;
  } else if (keyframes.length === 1) {
    keyframedValue = frame < keyframes[0].frame ? defaultValue : keyframes[0].value;
  } else if (frame <= keyframes[0].frame) {
    keyframedValue = keyframes[0].value;
  } else if (frame >= keyframes[keyframes.length - 1].frame) {
    keyframedValue = keyframes[keyframes.length - 1].value;
  } else {
    let prevKf = keyframes[0];
    let nextKf = keyframes[1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (frame >= keyframes[i].frame && frame <= keyframes[i + 1].frame) {
        prevKf = keyframes[i];
        nextKf = keyframes[i + 1];
        break;
      }
    }

    const duration = nextKf.frame - prevKf.frame;
    const t = duration === 0 ? 0 : clamp((frame - prevKf.frame) / duration, 0, 1);

    if (prop.valueType === 'vec2') {
      const fromVec = prevKf.value as Vec2;
      const toVec = nextKf.value as Vec2;
      if (prevKf.spatialOut || nextKf.spatialIn) {
        // Spatial motion path: the two components share one arc-length-parameterized bezier through
        // space, driven by the segment's temporal progress. Only position keyframes carry spatial
        // tangents, so every other vec2 property still takes the straight-line branch below.
        keyframedValue = positionOnSegment(fromVec, toVec, prevKf.spatialOut, nextKf.spatialIn, segmentProgress(t, prevKf, nextKf));
      } else {
        keyframedValue = [
          interpolateValue(fromVec[0], toVec[0], t, prevKf, nextKf),
          interpolateValue(fromVec[1], toVec[1], t, prevKf, nextKf),
        ];
      }
    } else {
      keyframedValue = interpolateValue(prevKf.value as number, nextKf.value as number, t, prevKf, nextKf);
    }
  }

  return tryExpression(prop, keyframedValue);
}

export function evaluateNumber(prop: AnimatableProperty, frame: number): number {
  const val = evaluateProperty(prop, frame);
  return typeof val === 'number' ? val : val[0];
}

export function evaluateVec2(prop: AnimatableProperty, frame: number): Vec2 {
  const val = evaluateProperty(prop, frame);
  return Array.isArray(val) ? val : [val, val];
}

function resolveTransform(transform: Transform, frame: number): ResolvedTransform {
  const pos = evaluateVec2(transform.position, frame);
  const scale = evaluateVec2(transform.scale, frame);
  const anchor = evaluateVec2(transform.anchorPoint, frame);
  return {
    positionX: pos[0],
    positionY: pos[1],
    rotation: evaluateNumber(transform.rotation, frame),
    scaleX: scale[0],
    scaleY: scale[1],
    anchorX: anchor[0],
    anchorY: anchor[1],
    opacity: clamp(evaluateNumber(transform.opacity, frame), 0, 1),
    // 2.5D: absent props resolve to 0, so a pure-2D layer is byte-identical to before.
    positionZ: transform.positionZ ? evaluateNumber(transform.positionZ, frame) : 0,
    rotationX: transform.rotationX ? evaluateNumber(transform.rotationX, frame) : 0,
    rotationY: transform.rotationY ? evaluateNumber(transform.rotationY, frame) : 0,
  };
}

// Evaluate a shape layer's path-modifier stack (B8a) to plain numbers for the current frame,
// dropping disabled modifiers. The pure geometry then runs in core/shapeModifiers.ts.
function resolveShapeModifiers(modifiers: ShapeLayer['modifiers'], frame: number): ResolvedShapeModifier[] {
  if (!modifiers || modifiers.length === 0) return [];
  const out: ResolvedShapeModifier[] = [];
  for (const m of modifiers) {
    if (!m.enabled) continue;
    if (m.type === 'trim') {
      out.push({ type: 'trim', start: evaluateNumber(m.start, frame), end: evaluateNumber(m.end, frame), offset: evaluateNumber(m.offset, frame) });
    } else if (m.type === 'offset') {
      out.push({ type: 'offset', amount: evaluateNumber(m.amount, frame) });
    } else if (m.type === 'roughen') {
      out.push({ type: 'roughen', amount: evaluateNumber(m.amount, frame), seed: m.seed });
    } else if (m.type === 'puckerBloat') {
      out.push({ type: 'puckerBloat', amount: evaluateNumber(m.amount, frame) });
    }
  }
  return out;
}

function resolveShapeLayer(layer: ShapeLayer, frame: number, getStyle?: StyleLookup): ResolvedShape {
  const shape = layer.shape;
  const defaultColor: Vec4 = [0.5, 0.5, 0.5, 1];
  // M21 - read fill/stroke THROUGH any linked color style before the material overlay.
  const fillColor = resolveDominantColor(layer.materialConfig, resolveStyleColor(layer.fillStyleId, shape.fillColor ?? defaultColor, getStyle));
  const strokeColor = resolveDominantColor(layer.strokeMaterialConfig, resolveStyleColor(layer.strokeStyleId, shape.strokeColor ?? [0, 0, 0, 1], getStyle));
  const base: ResolvedShape = {
    renderType: shape.type,
    width: 0,
    height: 0,
    fillColor,
    strokeColor,
    fill: resolveShapeFill(layer.materialConfig, fillColor),
    stroke: resolveShapeFill(layer.strokeMaterialConfig, strokeColor),
    pattern: resolveShapePattern(layer.patternFill),
    strokeWidth: evaluateNumber(shape.strokeWidth ?? { defaultValue: 0, keyframes: [] }, frame),
    borderRadius: 0,
    radius: 0,
    points: 0,
    outerRadius: 0,
    innerRadius: 0,
    vertices: [],
    closed: false,
    lineCap: 'butt',
    lineJoin: 'miter',
  };

  switch (shape.type) {
    case 'rectangle': {
      base.width = evaluateNumber(shape.width, frame);
      base.height = evaluateNumber(shape.height, frame);
      base.borderRadius = evaluateNumber(shape.borderRadius, frame);
      if (shape.cornerRadii) {
        base.cornerRadii = [
          evaluateNumber(shape.cornerRadii[0], frame),
          evaluateNumber(shape.cornerRadii[1], frame),
          evaluateNumber(shape.cornerRadii[2], frame),
          evaluateNumber(shape.cornerRadii[3], frame),
        ];
      }
      break;
    }
    case 'circle': {
      const r = evaluateNumber(shape.radius, frame);
      base.radius = r;
      base.width = r * 2;
      base.height = r * 2;
      break;
    }
    case 'star': {
      const pts = Math.round(evaluateNumber(shape.points, frame));
      const outer = evaluateNumber(shape.outerRadius, frame);
      const inner = evaluateNumber(shape.innerRadius, frame);
      base.points = pts;
      base.outerRadius = outer;
      base.innerRadius = inner;
      base.width = outer * 2;
      base.height = outer * 2;
      break;
    }
    case 'polygon': {
      let verts = shape.vertices;
      let closedFlag = shape.closed;
      // Shape morph (B8b): if the outline is animated, evaluate the pose at this frame FIRST - at/beyond
      // a pose this returns the original bezier vertices (byte-identical); between poses, a morph.
      if (shape.pathKeyframes && shape.pathKeyframes.length > 0) {
        const p = evalPathKeyframes(shape.pathKeyframes, frame);
        verts = p.vertices;
        closedFlag = p.closed;
      }
      // Path modifier stack (B8a/B8b): trim / offset / roughen / puckerBloat, in order, at resolve
      // time. Absent → vertices untouched (byte-identical). Holes pass through unmodified in v1.
      const mods = resolveShapeModifiers(layer.modifiers, frame);
      if (mods.length > 0 && verts.length >= 2) {
        const r = applyResolvedModifiers(verts, closedFlag, mods);
        verts = r.vertices;
        closedFlag = r.closed;
      }
      base.vertices = verts;
      base.closed = closedFlag;
      base.lineCap = shape.lineCap ?? 'butt';
      base.lineJoin = shape.lineJoin ?? 'miter';
      if (shape.holes && shape.holes.length > 0) base.holes = shape.holes; // M17 glyph counters
      // Dashed stroke (B8c): carry the pattern + the (animatable) offset for this frame.
      if (shape.strokeDash && shape.strokeDash.length > 0) {
        base.dashArray = shape.strokeDash;
        base.dashOffset = shape.dashOffset ? evaluateNumber(shape.dashOffset, frame) : 0;
      }
      // Compute bounding box for width/height
      if (verts.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const v of verts) {
          if (v.position[0] < minX) minX = v.position[0];
          if (v.position[0] > maxX) maxX = v.position[0];
          if (v.position[1] < minY) minY = v.position[1];
          if (v.position[1] > maxY) maxY = v.position[1];
        }
        base.width = maxX - minX;
        base.height = maxY - minY;
      }
      break;
    }
  }

  return base;
}

export function resolveLayer(layer: Layer, frame: number): ResolvedLayer | null {
  if (layer.type === 'group') return null;
  if (layer.type === 'text') return null;
  if (layer.type === 'video') return null;
  if (layer.type === 'image') return null;
  if (layer.type === 'audio') return null;
  if (!layer.visible) return null;
  if (frame < layer.inPoint || frame >= layer.outPoint) return null;
  const shapeLayer = layer as ShapeLayer;
  if (!shapeLayer.shape) return null;

  return {
    id: layer.id,
    visible: true,
    blendMode: layer.blendMode,
    transform: resolveTransform(layer.transform, frame),
    shape: resolveShapeLayer(shapeLayer, frame),
    layerType: 'shape',
  };
}

function isGroupVisible(groupId: string, layers: Layer[], frame: number): boolean {
  const group = _layerById.get(groupId);
  if (!group) return true;
  if (!group.visible) return false;
  if (frame < group.inPoint || frame >= group.outPoint) return false;
  if (group.parentId) return isGroupVisible(group.parentId, layers, frame);
  return true;
}

function getParentTransform(layerId: string, layers: Layer[], frame: number): ResolvedTransform {
  const layer = _layerById.get(layerId);
  if (!layer || !layer.parentId) {
    const layoutOffset = _layoutOffsets.get(layerId);
    if (layoutOffset) {
      return { positionX: layoutOffset.x, positionY: layoutOffset.y, rotation: layoutOffset.rotation ?? 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1, positionZ: 0, rotationX: 0, rotationY: 0 };
    }
    return { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1, positionZ: 0, rotationX: 0, rotationY: 0 };
  }
  const parent = _layerById.get(layer.parentId);
  if (!parent) {
    return { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1, positionZ: 0, rotationX: 0, rotationY: 0 };
  }

  const parentLocal = resolveTransform(parent.transform, frame);
  const grandparent = getParentTransform(parent.id, layers, frame);
  let composed = composeTransforms(grandparent, parentLocal);

  const layoutOffset = _layoutOffsets.get(layerId);
  if (layoutOffset) {
    composed = {
      ...composed,
      positionX: composed.positionX + layoutOffset.x,
      positionY: composed.positionY + layoutOffset.y,
      rotation: composed.rotation + (layoutOffset.rotation ?? 0),
    };
  }

  return composed;
}

function composeTransforms(parent: ResolvedTransform, child: ResolvedTransform): ResolvedTransform {
  const cosR = Math.cos(parent.rotation * Math.PI / 180);
  const sinR = Math.sin(parent.rotation * Math.PI / 180);

  const scaledX = child.positionX * parent.scaleX;
  const scaledY = child.positionY * parent.scaleY;
  const rotatedX = scaledX * cosR - scaledY * sinR;
  const rotatedY = scaledX * sinR + scaledY * cosR;

  return {
    positionX: parent.positionX + rotatedX,
    positionY: parent.positionY + rotatedY,
    rotation: parent.rotation + child.rotation,
    scaleX: parent.scaleX * child.scaleX,
    scaleY: parent.scaleY * child.scaleY,
    anchorX: child.anchorX,
    anchorY: child.anchorY,
    opacity: parent.opacity * child.opacity,
    // 2.5D depth propagates additively like rotation. 0 for all pure-2D content, so this
    // 2D affine path stays byte-identical; the true 3D compose lives in the M2 render path.
    positionZ: parent.positionZ + child.positionZ,
    rotationX: parent.rotationX + child.rotationX,
    rotationY: parent.rotationY + child.rotationY,
  };
}

// Per-character text animation: expand a text layer with active animators into per-glyph stamps -
// mirrors the cloner, so the renderer draws each glyph as a normal 1-char text quad (ZERO renderer
// changes). SINGLE VISUAL LINE ONLY for now (no hard breaks / wrapping); multi-line falls back to a
// normal single render (returns null) so placement is never wrong. BROWSER-GATED: glyph x/y come
// from canvas measurement (OffscreenCanvas) and need an in-browser eyeball; the per-glyph delta math
// is unit-tested (scripts/verify-textanimator.mjs).
function expandTextGlyphs(
  layer: TextLayer,
  baseText: ResolvedText,
  world: ResolvedTransform,
  frame: number,
  common: Pick<ResolvedLayer, 'visible' | 'blendMode' | 'motionBlur' | 'shadow' | 'glow' | 'blur' | 'layerType'>,
  textPathData: { nodes: TextPathNode[]; closed: boolean; align: boolean; margin: number } | null,
): ResolvedLayer[] | null {
  const active = (layer.animators ?? []).filter((a) => a.enabled);
  const content = baseText.content;
  const decode = layer.decode?.enabled ? layer.decode : null;
  const onPath = textPathData && textPathData.nodes.length >= 2 ? textPathData : null;
  if ((active.length === 0 && !decode && !onPath) || !content) return null;

  const layout = getTextLayout(baseText);
  // Only the clean single-line case: bail (normal render) on hard breaks or word-wrap.
  if (layout.lines.length !== 1 || content.includes('\n') || layout.lines[0] !== content) return null;

  // Decode (B9): the reveal fraction for this frame; each unrevealed glyph shows a seeded scramble char.
  const decProgress = decode ? evaluateNumber(decode.progress, frame) : 1;
  // Text-on-path (B9b): total arc length, computed once (glyph fractions map into it below).
  const pathLen = onPath ? totalPathLength(onPath.nodes, onPath.closed) : 0;

  const resolvedAnims: ResolvedTextAnimator[] = active.map((a) => ({
    splitMode: a.splitMode,
    selector: a.offset ? { ...a.selector, offset: evaluateNumber(a.offset, frame) } : a.selector,
    delta: a.delta,
  }));
  const deltas = accumulateGlyphDeltas(content, resolvedAnims);

  const { canvasWidth, padding } = layout;
  const lineW = measureAdvance(baseText, content, content.length);
  const lineStartX =
    baseText.textAlign === 'center' ? (canvasWidth - lineW) / 2
    : baseText.textAlign === 'right' ? canvasWidth - padding - lineW
    : padding;
  const halfFont = baseText.fontSize / 2;

  const stamps: ResolvedLayer[] = [];
  let advPrev = 0;
  for (let j = 0; j < content.length; j++) {
    const advNext = measureAdvance(baseText, content, j + 1);
    const ch = content[j];
    const d = deltas[j];
    // Skip whitespace (no glyph) and fully-transparent glyphs (cheap - a reveal hides many).
    if (ch.trim() !== '' && d.opacity > 0.001) {
      // Decode swaps the SHOWN character (position/advance still use the real char, so glyphs flicker
      // in place). Absent → the real char.
      const showCh = decode ? decodeCharAt(ch, j, content.length, decProgress, frame, decode.seed, decode.charset, decode.scrambleHold) : ch;
      const stampText: ResolvedText = { ...baseText, content: showCh, measuredWidth: 0, measuredHeight: 0 };
      const m = measureText(stampText);
      stampText.measuredWidth = m.width;
      stampText.measuredHeight = m.height;
      const centerDist = advPrev + (advNext - advPrev) / 2;
      const centerX = lineStartX + centerDist;
      // Text-on-path (B9b): map the glyph's along-text distance to an arc-length point + tangent on
      // the path (layer-local space); else the normal linear layout. The pivot-offset (−anchor) and
      // composeTransforms(world, …) below apply the layer transform identically either way.
      let posX = centerX - world.anchorX + d.tx;
      let posY = padding + halfFont - world.anchorY + d.ty;
      let rot = d.rotation;
      if (onPath) {
        const { position, angle } = pointAndAngleAt(onPath.nodes, onPath.closed, glyphPathFraction(centerDist, pathLen, onPath.margin));
        posX = position[0] - world.anchorX + d.tx;
        posY = position[1] - world.anchorY + d.ty;
        rot = (onPath.align ? angle : 0) + d.rotation;
      }
      // Offset from the layer's pivot (anchor value cancels: the whole-text and stamp renders share
      // the same pivot). Scale/rotate pivot at the glyph centre.
      const child: ResolvedTransform = {
        positionX: posX,
        positionY: posY,
        rotation: rot,
        scaleX: d.sx,
        scaleY: d.sy,
        anchorX: m.width / 2,
        anchorY: padding + halfFont,
        opacity: d.opacity,
        positionZ: 0,
        // Per-character 3D (B9c): out-of-plane spin per glyph. composeTransforms adds the layer's own
        // 3D rotation; writeCard3D renders the card MVP when the stamp is3D + a camera is active.
        rotationX: d.rx,
        rotationY: d.ry,
      };
      // Per-character blur (B9d): a gaussian blur per stamp = the layer's base blur + the glyph's
      // accumulated blur delta. Each stamp is a text draw that carries `blur` through the existing
      // per-layer blur pipeline (no new render). Absent (blur 0) → the shared base blur is untouched.
      const glyphBlur: ResolvedBlur | undefined = d.blur > 0
        ? { type: 'gaussian', radius: d.blur + (common.blur?.radius ?? 0), angle: 0, centerX: 0.5, centerY: 0.5, strength: 0, passes: common.blur?.passes ?? 2 }
        : common.blur;
      stamps.push({ ...common, id: `${layer.id}#g${j}`, transform: composeTransforms(world, child), text: stampText, blur: glyphBlur, ...(layer.is3D ? { is3D: true } : {}) });
    }
    advPrev = advNext;
  }
  // Return the stamp list even when empty (every glyph currently hidden) - an empty result must draw
  // nothing, NOT fall back to rendering the whole string. null is reserved for "can't expand" above.
  return stamps;
}

function resolveTextLayer(layer: TextLayer, frame: number, getStyle?: StyleLookup): ResolvedText {
  const span = layer.content.spans[0];
  if (!span) {
    return {
      content: '',
      mode: 'point',
      boxWidth: 300,
      boxHeight: 200,
      fontFamily: 'Inter',
      fontWeight: 400,
      fontStyle: 'normal',
      fontSize: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
      fillColor: [1, 1, 1, 1],
      strokeColor: [0, 0, 0, 0],
      strokeWidth: 0,
      textAlign: 'center',
      underline: false,
      strikethrough: false,
      measuredWidth: 0,
      measuredHeight: 0,
    };
  }

  const style = span.style;
  const fullText = layer.content.spans.map((s) => {
    const t = s.style.textTransform;
    if (t === 'uppercase') return s.text.toUpperCase();
    if (t === 'lowercase') return s.text.toLowerCase();
    if (t === 'capitalize') return s.text.replace(/\b\w/g, (c) => c.toUpperCase());
    return s.text;
  }).join('');

  const bb = layer.layoutConfig.boundingBox;
  const mode: 'point' | 'box' = bb.type === 'auto' ? 'point' : 'box';
  const boxWidth = bb.type === 'fixed' ? bb.width : bb.type === 'fixedWidth' ? bb.width : 300;
  const boxHeight = bb.type === 'fixed' ? bb.height : 200;

  const resolved: ResolvedText = {
    content: fullText,
    mode,
    boxWidth,
    boxHeight,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    fontSize: evaluateNumber(layer.animOverrides.fontSize, frame),
    lineHeight: evaluateNumber(layer.animOverrides.lineHeight, frame),
    letterSpacing: evaluateNumber(layer.animOverrides.letterSpacing, frame),
    fillColor: resolveStyleColor(layer.fillStyleId, style.color, getStyle),
    strokeColor: resolveStyleColor(layer.strokeStyleId, style.strokeColor, getStyle),
    strokeWidth: evaluateNumber(layer.animOverrides.strokeWidth, frame),
    textAlign: layer.layoutConfig.horizontalAlign,
    underline: style.underline,
    strikethrough: style.strikethrough,
    fill: style.fill,
    measuredWidth: 0,
    measuredHeight: 0,
  };
  const measured = measureText(resolved);
  resolved.measuredWidth = measured.width;
  resolved.measuredHeight = measured.height;
  return resolved;
}

function resolveVideoLayer(layer: VideoLayer, frame: number, compositionFrameRate: number): ResolvedVideo | null {
  const v = layer.video;
  const totalSourceFrames = Math.round(v.sourceDuration * v.sourceFrameRate);
  let clampedFrame: number;
  let sourceFrameB: number | undefined;
  let blendMix: number | undefined;
  if (v.freezeSourceFrame != null && !v.timeRemap) {
    // Freeze pins the whole clip to one source frame (captured at the playhead). No blend.
    clampedFrame = Math.max(0, Math.min(Math.floor(v.freezeSourceFrame), Math.max(0, totalSourceFrames - 1)));
  } else {
    // Animated Time Remap (curve value = source seconds) supersedes playbackRate/reversed/freeze;
    // otherwise the classic constant-rate mapping.
    const seconds = v.timeRemap
      ? evaluateNumber(v.timeRemap, frame)
      : linearSourceSeconds(frame, layer.inPoint, layer.outPoint, v.startOffset, compositionFrameRate, v.playbackRate, !!v.reversed);
    if (v.frameBlend) {
      const split = frameBlendSplit(seconds, v.sourceFrameRate, totalSourceFrames);
      clampedFrame = split.frameA;
      if (split.mix > 1e-4 && split.frameB !== split.frameA) { sourceFrameB = split.frameB; blendMix = split.mix; }
    } else {
      clampedFrame = sourceFrameFromSeconds(seconds, v.sourceFrameRate, totalSourceFrames);
    }
  }

  return {
    assetId: v.assetId,
    sourceFrame: clampedFrame,
    sourceWidth: v.sourceWidth,
    sourceHeight: v.sourceHeight,
    playbackRate: v.playbackRate,
    playbackMode: v.playbackMode,
    proxyScale: v.proxyScale,
    ...(sourceFrameB != null ? { sourceFrameB, blendMix, interp: v.retimeInterp ?? 'mix' } : {}),
  };
}

function resolveImageLayer(layer: ImageLayer): ResolvedImage {
  // Effects are static scalars for now (params copied through). Ordered stack, honoring the
  // per-effect enable AND the layer master switch (B11a - effectsEnabled was previously a no-op).
  const effects = resolveEffectStack(layer.effects, layer.effectsEnabled !== false);
  return {
    assetId: layer.image.assetId,
    sourceWidth: layer.image.sourceWidth,
    sourceHeight: layer.image.sourceHeight,
    filters: layer.filters,
    colorCorrection: layer.colorCorrection,
    effects,
  };
}

function resolveMask(masks: Mask[] | undefined, frame: number): ResolvedMask | undefined {
  if (!masks || masks.length === 0) return undefined;
  const mask = masks.find((m) => m.enabled);
  if (!mask) return undefined;
  const pos = evaluateVec2(mask.position, frame);
  const size = evaluateVec2(mask.size, frame);
  return {
    type: mask.type,
    centerX: pos[0],
    centerY: pos[1],
    sizeX: size[0],
    sizeY: size[1],
    rotation: evaluateNumber(mask.rotation, frame),
    feather: Math.max(0, evaluateNumber(mask.feather, frame)),
    invert: mask.inverted,
    opacity: clamp(evaluateNumber(mask.opacity, frame), 0, 1),
    points: Math.max(3, Math.round(mask.points)),
    innerRadius: Math.max(0, evaluateNumber(mask.innerRadius, frame)),
    ...maskPathFields(mask, frame),
  };
}

// Freeform path mask (B10c foundation): evaluate the optional outline + per-vertex feather for the
// frame. Empty ({}) for ordinary parametric masks, so ResolvedMask is unchanged for them.
function maskPathFields(mask: Mask, frame: number): { vertices?: PathVertex[]; feathers?: number[] } {
  if (!mask.vertices && !(mask.pathKeyframes && mask.pathKeyframes.length > 0)) return {};
  const vertices = resolveMaskVertices(mask.vertices, mask.pathKeyframes, frame);
  const feathers = resolveMaskFeathers(mask.feathers, vertices.length, Math.max(0, evaluateNumber(mask.feather, frame)));
  return { vertices, feathers };
}

function resolveMasks(masks: Mask[] | undefined, frame: number): ResolvedMask[] {
  if (!masks || masks.length === 0) return [];
  const result: ResolvedMask[] = [];
  for (const mask of masks) {
    if (!mask.enabled) continue;
    const pos = evaluateVec2(mask.position, frame);
    const size = evaluateVec2(mask.size, frame);
    result.push({
      type: mask.type,
      centerX: pos[0],
      centerY: pos[1],
      sizeX: size[0],
      sizeY: size[1],
      rotation: evaluateNumber(mask.rotation, frame),
      feather: Math.max(0, evaluateNumber(mask.feather, frame)),
      invert: mask.inverted,
      opacity: clamp(evaluateNumber(mask.opacity, frame), 0, 1),
      points: Math.max(3, Math.round(mask.points)),
      innerRadius: Math.max(0, evaluateNumber(mask.innerRadius, frame)),
      ...maskPathFields(mask, frame),
    });
  }
  return result;
}

// Resolve a layer's world-space transform at a given frame, including parent
// composition and any motion-path override. Shared by the main resolve pass and
// the motion-blur velocity sampling (which re-resolves at frame - 1).
function worldTransformAt(
  layer: Layer,
  layers: Layer[],
  motionPaths: MotionPath[],
  frame: number,
): ResolvedTransform {
  const localTransform = resolveTransform(layer.transform, frame);
  const parentTransform = getParentTransform(layer.id, layers, frame);
  let worldTransform = composeTransforms(parentTransform, localTransform);

  const layerPath = motionPaths.find((p) => p.layerId === layer.id && p.nodes.length >= 2);
  if (layerPath) {
    const { position, angle } = evaluateMotionPathAtFrame(layerPath, frame);
    worldTransform = { ...worldTransform, positionX: position[0], positionY: position[1] };
    if (layerPath.orientToPath) {
      worldTransform = { ...worldTransform, rotation: angle };
    }
  }
  return worldTransform;
}

// Derive the analytic motion-blur descriptor from frame-to-frame motion. We
// re-resolve the world transform one frame earlier and diff the pivot position,
// rotation and scale. This captures keyframed animation, motion paths, manual
// moves and anything else that changes the transform - without inspecting
// keyframes directly. Returns undefined when blur is disabled or the layer is
// effectively static, so the renderer keeps its zero-overhead fast path.
function computeMotionBlur(
  layer: Layer,
  current: ResolvedTransform,
  layers: Layer[],
  motionPaths: MotionPath[],
  frame: number,
  compShutterAngle?: number,
  compShutterPhase?: number,
): ResolvedMotionBlur | undefined {
  if (!getMotionBlur(layer)) return undefined;

  // Composition shutter angle is the global streak length; the per-layer shutter is a relative factor.
  const shutter = effectiveShutterAngle(compShutterAngle, layer.motionBlurShutter);
  if (shutter <= 0) return undefined;
  const phase = shutterPhaseFraction(compShutterPhase, shutter);

  const prevFrame = Math.max(frame - 1, layer.inPoint);
  const prev = prevFrame === frame
    ? current
    : worldTransformAt(layer, layers, motionPaths, prevFrame);

  const pivotX = current.positionX + current.anchorX;
  const pivotY = current.positionY + current.anchorY;
  const vx = pivotX - (prev.positionX + prev.anchorX);
  const vy = pivotY - (prev.positionY + prev.anchorY);
  const omega = (current.rotation - prev.rotation) * Math.PI / 180;
  const scaleRateX = current.scaleX !== 0 ? (current.scaleX - prev.scaleX) / current.scaleX : 0;
  const scaleRateY = current.scaleY !== 0 ? (current.scaleY - prev.scaleY) / current.scaleY : 0;

  const moving =
    Math.abs(vx) > 1e-4 || Math.abs(vy) > 1e-4 ||
    Math.abs(omega) > 1e-5 ||
    Math.abs(scaleRateX) > 1e-5 || Math.abs(scaleRateY) > 1e-5;
  if (!moving) return undefined;

  return { shutter, phase, pivotX, pivotY, vx, vy, omega, scaleRateX, scaleRateY };
}

// Derive the resolved shadow descriptor for a layer at the current frame. The
// shadow is anchored at the layer's pivot (so the cast appears to grow from the
// object's base) and projected by the renderer. Returns undefined when the
// shadow is disabled, keeping the zero-overhead fast path for layers without it.
function computeShadow(
  shadow: LayerShadow | undefined,
  current: ResolvedTransform,
): ResolvedShadow | undefined {
  if (!shadow || !shadow.enabled) return undefined;
  return {
    color: shadow.color,
    lightAngle: shadow.lightAngle,
    lightDistance: shadow.lightDistance,
    shadowScale: shadow.shadowScale,
    blurRadius: shadow.blurRadius,
    onlyShadow: shadow.onlyShadow,
    pivotX: current.positionX + current.anchorX,
    pivotY: current.positionY + current.anchorY,
  };
}

function computeGlow(
  glow: LayerGlow | undefined,
): ResolvedGlow | undefined {
  if (!glow || !glow.enabled) return undefined;
  return {
    mode: glow.mode,
    onlyGlow: glow.onlyGlow,
    color: glow.color,
    intensity: glow.intensity,
    radius: glow.radius,
    threshold: glow.threshold,
  };
}

function computeBlur(
  blur: LayerBlur | undefined,
): ResolvedBlur | undefined {
  if (!blur || !blur.enabled) return undefined;
  if (blur.radius <= 0 && blur.strength <= 0) return undefined;
  return {
    type: blur.type,
    radius: blur.radius,
    angle: blur.angle,
    centerX: blur.centerX,
    centerY: blur.centerY,
    strength: blur.strength,
    passes: blur.passes,
  };
}

function measureLayerPreferredSize(layer: Layer, frame: number): { width: number; height: number } {
  if (layer.type === 'shape') {
    const shape = (layer as ShapeLayer).shape;
    if (!shape) return { width: 100, height: 100 };
    switch (shape.type) {
      case 'rectangle':
        return { width: evaluateNumber(shape.width, frame), height: evaluateNumber(shape.height, frame) };
      case 'circle': {
        const r = evaluateNumber(shape.radius, frame);
        return { width: r * 2, height: r * 2 };
      }
      case 'star':
      case 'polygon': {
        const outer = evaluateNumber((shape as { outerRadius: AnimatableProperty }).outerRadius, frame);
        return { width: outer * 2, height: outer * 2 };
      }
    }
  }
  if (layer.type === 'text') {
    const textLayer = layer as TextLayer;
    const bb = textLayer.layoutConfig.boundingBox;
    if (bb.type === 'fixed') return { width: bb.width, height: bb.height };
    if (bb.type === 'fixedWidth') return { width: bb.width, height: 40 };
    return { width: 200, height: 40 };
  }
  if (layer.type === 'image') {
    const img = layer as ImageLayer;
    return { width: img.image.sourceWidth || 200, height: img.image.sourceHeight || 200 };
  }
  if (layer.type === 'video') {
    const vid = layer as VideoLayer;
    return { width: vid.video.sourceWidth || 320, height: vid.video.sourceHeight || 240 };
  }
  return { width: 100, height: 100 };
}

// Resolve a cloner field ref → an already-sampled FieldGrid, reusing the procedural
// field engine's rasterizer. Cached by the field's configJSON so it is NOT re-
// rasterized every frame (field data is treated as static; keeps instance placement
// stable/deterministic). The async worker path isn't needed here - CPU rasterization
// is synchronous, matching the pure engine's synchronous contract.
const CLONER_FIELD_RES = 128;
const _clonerFieldCache = new Map<string, { hash: string; grid: FieldGrid }>();
function resolveClonerField(fieldRef: string, layers: Layer[]): FieldGrid | undefined {
  const layer = layers.find((l) => l.id === fieldRef);
  if (!layer || layer.type !== 'fieldSampled') return undefined;
  const configJSON = layer.fieldSampled.configJSON;
  const cached = _clonerFieldCache.get(fieldRef);
  if (cached && cached.hash === configJSON) return cached.grid;
  try {
    const config = JSON.parse(configJSON);
    if (!config?.field) return undefined;
    const grid = rasterizeField(config.field, CLONER_FIELD_RES, CLONER_FIELD_RES, 0);
    _clonerFieldCache.set(fieldRef, { hash: configJSON, grid });
    return grid;
  } catch {
    return undefined;
  }
}

const EMPTY_VISITED: ReadonlySet<string> = new Set();

// In-shape Repeater (B8d): hard cap on expanded copies (perf/runaway guard) + the reused
// single-copy sentinel for shapes without a repeater (identity - keeps them byte-identical).
const MAX_REPEATER_COPIES = 300;
const SINGLE_COPY: readonly RepeaterCopy[] = [{ dx: 0, dy: 0, rotation: 0, scale: 1, opacity: 1 }];

// 2.5D (M1) - resolve the frame's active camera. AE model: the active camera is the topmost
// enabled camera layer active at this frame; with none, a default camera frames the comp 1:1.
// `sortedLayers` is in render order (topmost drawn last), so the last matching camera wins.
/**
 * The camera eye position at `frame`, honouring the optional smooth spatial-bezier path
 * (`camera.spatialTangents`). When a segment's endpoints carry no tangent the control points fall
 * on the 1/3–2/3 line, so the result is byte-identical to the plain evaluated position - this is a
 * strict, opt-in generalisation. Timing (the along-path parameter `u`) is extracted from the REAL
 * keyframe interpolation of the dominant axis, so easing/hold on the position keys still applies.
 * Exported so the 3D-view schematic can draw exactly what the renderer will show.
 */
export function resolveCameraEye(cam: CameraLayer, frame: number): Vec3 {
  const posP = cam.transform.position;
  const zP = cam.transform.positionZ;
  const point = (f: number): Vec3 => {
    const xy = evaluateVec2(posP, f);
    return [xy[0], xy[1], zP ? evaluateNumber(zP, f) : 0];
  };
  const tans = cam.camera.spatialTangents;
  if (!tans || tans.length === 0) return point(frame);

  const frames = Array.from(new Set([
    ...posP.keyframes.map((k) => k.frame),
    ...(zP ? zP.keyframes.map((k) => k.frame) : []),
  ])).sort((a, b) => a - b);
  if (frames.length < 2) return point(frame);
  if (frame <= frames[0]) return point(frames[0]);
  if (frame >= frames[frames.length - 1]) return point(frames[frames.length - 1]);

  let i = 0;
  while (i < frames.length - 1 && frame >= frames[i + 1]) i++;
  const fa = frames[i], fb = frames[i + 1];
  const A = point(fa), B = point(fb);
  const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];

  // Along-path parameter from the true interpolation of whichever axis moves most.
  const adx = Math.abs(dx), ady = Math.abs(dy), adz = Math.abs(dz);
  let u: number;
  if (Math.max(adx, ady, adz) < 1e-6) u = (frame - fa) / (fb - fa);
  else if (adx >= ady && adx >= adz) u = (evaluateVec2(posP, frame)[0] - A[0]) / dx;
  else if (ady >= adz) u = (evaluateVec2(posP, frame)[1] - A[1]) / dy;
  else u = ((zP ? evaluateNumber(zP, frame) : 0) - A[2]) / dz;

  const tanOut = tans.find((t) => t.frame === fa)?.tangent ?? null;
  const tanIn = tans.find((t) => t.frame === fb)?.tangent ?? null; // node's OUT dir; incoming is −it
  const c1: Vec3 = tanOut ? [A[0] + tanOut[0], A[1] + tanOut[1], A[2] + tanOut[2]] : [A[0] + dx / 3, A[1] + dy / 3, A[2] + dz / 3];
  const c2: Vec3 = tanIn ? [B[0] - tanIn[0], B[1] - tanIn[1], B[2] - tanIn[2]] : [B[0] - dx / 3, B[1] - dy / 3, B[2] - dz / 3];
  return cubicBezierVec3(A, c1, c2, B, u);
}

function resolveActiveCamera(composition: Composition, sortedLayers: Layer[], frame: number): ResolvedCamera {
  const { width, height } = composition.settings;
  let chosen: CameraLayer | null = null;
  for (const l of sortedLayers) {
    if (l.type !== 'camera') continue;
    if (!l.visible) continue;
    if (frame < l.inPoint || frame >= l.outPoint) continue;
    chosen = l;
  }
  if (!chosen) return defaultCamera(width, height);
  const t = resolveTransform(chosen.transform, frame);
  // Eye honours the optional smooth spatial-bezier path; falls back to the plain transform when
  // there are no tangents (byte-identical). rotationX/Y/rotation still come from `t` (one-node aim).
  const eye: Vec3 = resolveCameraEye(chosen, frame);
  const zoom = evaluateNumber(chosen.camera.zoom, frame);
  let target: Vec3;
  if (chosen.camera.mode === 'two-node') {
    const poi = evaluateVec2(chosen.camera.pointOfInterest, frame);
    target = [poi[0], poi[1], evaluateNumber(chosen.camera.pointOfInterestZ, frame)];
  } else {
    const fwd = forwardVector(t.rotationX, t.rotationY, t.rotation);
    target = [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]];
  }
  const dof = chosen.camera.dofEnabled
    ? {
        // Lock to Zoom (AE): focus distance tracks Zoom live, ignoring the stored property.
        // Undefined lockToZoom ⇒ off (legacy cameras read their stored focusDistance).
        focusDistance: chosen.camera.lockToZoom ? zoom : evaluateNumber(chosen.camera.focusDistance, frame),
        aperture: evaluateNumber(chosen.camera.aperture, frame),
        blurLevel: evaluateNumber(chosen.camera.blurLevel, frame),
      }
    : null;
  // Note: filmSize/measureFilmSize/units are deliberately NOT read here - they affect only the
  // dialog's derived-field display, never the render (zoom is the sole render-affecting field).
  return cameraFromParams({ eye, target, zoom, compW: width, compH: height, dof });
}

// 2.5D (M1) - a 3D layer's world model matrix: compose local model matrices down the parent
// chain (root→leaf). Uses the module-level `_layerById` populated by resolveFrame. Dormant
// until the M3 `is3D` UI + M2 renderer consume it; harness-tested via camera3d directly.
function worldMatrixFor(layerId: string, frame: number): Mat4 {
  const chain: Layer[] = [];
  const guard = new Set<string>();
  let cur: Layer | undefined = _layerById.get(layerId);
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.push(cur);
    cur = cur.parentId ? _layerById.get(cur.parentId) : undefined;
  }
  chain.reverse();
  return composeWorldMatrix(chain.map((l) => localModelMatrix(resolveTransform(l.transform, frame))));
}

export function resolveFrame(composition: Composition, frame: number, ctx?: ResolveContext): RenderFrame {
  const { settings, layers } = composition;
  const getStyle = ctx?.getStyle; // M21 - linked-style lookup, read through by shape/text fill+stroke
  const motionPaths = composition.motionPaths || [];
  const resolvedLayers: ResolvedLayer[] = [];
  const tracks = composition.tracks || [];
  // Frame-independent structural data (id map, render-order sort, track sets),
  // cached across frames - see getStructuralCache. Solo: when any track is soloed,
  // only soloed tracks render (AE/Premiere semantics); empty set → no-op.
  const struct = getStructuralCache(layers, tracks);
  _layerById = struct.layerById;
  const hiddenTrackIds = struct.hiddenTrackIds;
  const soloTrackIds = struct.soloTrackIds;
  const soloing = struct.soloing;
  const sortedLayers = struct.sortedLayers;

  // Pre-compute layout offsets for children of active layout containers
  _layoutOffsets = new Map();
  _layoutContainerSizes = new Map();
  for (const layer of layers) {
    if (!struct.hasLayoutLayers) break; // no layout/container layers → skip the O(N) pass
    if (layer.type !== 'hbox' && layer.type !== 'vbox' && layer.type !== 'grid') continue;
    if (!layer.visible) continue;
    if (frame < layer.inPoint || frame >= layer.outPoint) continue;
    const layoutLayer = layer as LayoutObjectLayer;
    const children: ChildMeasurement[] = layoutLayer.children
      .map((childId) => {
        const child = _layerById.get(childId);
        if (!child) return null;
        const override = layoutLayer.childOverrides[childId] || {
          grow: 0, shrink: 0, margin: { top: 0, right: 0, bottom: 0, left: 0 }, layoutVisibility: 'visible' as const,
        };
        const size = measureLayerPreferredSize(child, frame);
        return { id: childId, override, preferredWidth: size.width, preferredHeight: size.height };
      })
      .filter((c): c is ChildMeasurement => c !== null);

    let computed;
    if (layoutLayer.type === 'grid') {
      computed = computeGridLayout(layoutLayer.layoutParams, children);
    } else {
      const direction = layoutLayer.type === 'hbox' ? 'horizontal' : 'vertical';
      computed = computeLayout(layoutLayer.layoutParams, children, direction);
    }

    _layoutContainerSizes.set(layoutLayer.id, computed.containerSize);
    for (const [childId, rect] of Object.entries(computed.childRects)) {
      _layoutOffsets.set(childId, { x: rect.x, y: rect.y });
    }
  }

  // Pre-compute layout container (spatial/path-based) offsets
  for (const layer of layers) {
    if (!struct.hasLayoutLayers) break; // no layout/container layers → skip the O(N) pass
    if (layer.type !== 'layoutContainer') continue;
    if (!layer.visible) continue;
    if (frame < layer.inPoint || frame >= layer.outPoint) continue;
    const container = layer as LayoutContainerLayer;
    const computedData = computeContainerLayout(
      container.containerShape,
      container.distributionMode,
      container.children,
      container.spacing,
      container.padding,
      container.rotationOffset,
    );
    _layoutContainerSizes.set(container.id, {
      width: computedData.bounds.width,
      height: computedData.bounds.height,
    });
    const followRotation = container.followPathRotation === true;
    for (const [childId, pos] of Object.entries(computedData.childPositions)) {
      // pos.angle is the path tangent in degrees (0 for non-path distributions);
      // only apply it when the container opts into orienting children to the path.
      _layoutOffsets.set(childId, { x: pos.x, y: pos.y, ...(followRotation ? { rotation: pos.angle } : {}) });
    }
  }

  for (let i = 0; i < sortedLayers.length; i++) {
    const layer = sortedLayers[i];
    if (layer.type === 'group') continue;
    if (layer.type === 'audio') continue;
    if (layer.type === 'camera') continue; // 2.5D: cameras resolve to matrices, not a drawn quad
    if (!layer.visible) continue;
    if (layer.trackId && hiddenTrackIds.has(layer.trackId)) continue;
    if (soloing && (!layer.trackId || !soloTrackIds.has(layer.trackId))) continue;
    if (frame < layer.inPoint || frame >= layer.outPoint) continue;
    if (layer.parentId && !isGroupVisible(layer.parentId, layers, frame)) continue;

    // Layout containers: render as outlined rectangles
    if (layer.type === 'hbox' || layer.type === 'vbox' || layer.type === 'grid' || layer.type === 'layoutContainer') {
      const worldTransform = worldTransformAt(layer, layers, motionPaths, frame);
      const rawSize = _layoutContainerSizes.get(layer.id) || { width: 200, height: 200 };
      const containerSize = { width: Math.max(rawSize.width, 60), height: Math.max(rawSize.height, 60) };
      const layoutLayer = layer.type === 'layoutContainer'
        ? null
        : layer as LayoutObjectLayer;
      const borderColor = layoutLayer?.layoutParams.borderColor;
      const borderWidth = layoutLayer?.layoutParams.borderWidth ?? 1;
      const borderRadius = layoutLayer?.layoutParams.borderRadius ?? 0;
      const bgColor = layoutLayer?.layoutParams.background;
      const parsedBg = bgColor ? hexToVec4(bgColor, 0.05) : [0, 0, 0, 0] as Vec4;
      const parsedBorder = borderColor ? hexToVec4(borderColor) : [0.35, 0.55, 0.85, 0.7] as Vec4;

      resolvedLayers.push({
        id: layer.id,
        visible: true,
        blendMode: layer.blendMode,
        transform: worldTransform,
        shape: {
          renderType: 'rectangle',
          width: containerSize.width,
          height: containerSize.height,
          fillColor: parsedBg as Vec4,
          strokeColor: parsedBorder as Vec4,
          strokeWidth: borderWidth || 1.5,
          borderRadius,
          radius: 0,
          points: 0,
          outerRadius: 0,
          innerRadius: 0,
          vertices: [],
          closed: true,
          lineCap: 'butt',
          lineJoin: 'miter',
        },
        layerType: 'shape',
      });
      continue;
    }

    setExpressionContext(
      layer.id,
      frame,
      settings.frameRate,
      i,
      layer.inPoint,
      layer.outPoint,
      settings.durationFrames,
      settings.width,
      settings.height,
    );

    try {
      const worldTransform = worldTransformAt(layer, layers, motionPaths, frame);
      const motionBlur = computeMotionBlur(layer, worldTransform, layers, motionPaths, frame, settings.shutterAngle, settings.shutterPhase);
      const shadow = computeShadow((layer as { shadow?: LayerShadow }).shadow, worldTransform);
      const glow = computeGlow((layer as { glow?: LayerGlow }).glow);
      const blur = computeBlur((layer as { blur?: LayerBlur }).blur);

      if (layer.type === 'text') {
        const resolvedText = resolveTextLayer(layer, frame, getStyle);
        const common = { visible: true as const, blendMode: layer.blendMode, motionBlur, shadow, glow, blur, layerType: 'text' as const };
        // Text-on-path (B9b): resolve the referenced MotionPath's nodes (layer-local) for placement.
        const tpBind = layer.textPath?.enabled ? layer.textPath : null;
        const tpPath = tpBind ? motionPaths.find((p) => p.id === tpBind.pathId) : undefined;
        const textPathData = tpBind && tpPath && tpPath.nodes.length >= 2
          ? { nodes: tpPath.nodes as TextPathNode[], closed: tpPath.closed, align: tpBind.align, margin: tpBind.margin }
          : null;
        // Per-character animators expand into per-glyph stamps (single-line); plain text is untouched.
        const glyphStamps = expandTextGlyphs(layer, resolvedText, worldTransform, frame, common, textPathData);
        if (glyphStamps) {
          resolvedLayers.push(...glyphStamps);
        } else {
          resolvedLayers.push({
            id: layer.id,
            transform: worldTransform,
            text: resolvedText,
            mask: resolveMask(layer.masks, frame),
            masks: resolveMasks(layer.masks, frame),
            ...common,
          });
        }
      } else if (layer.type === 'video') {
        const resolvedVideo = resolveVideoLayer(layer, frame, settings.frameRate);
        if (resolvedVideo) {
          resolvedLayers.push({
            id: layer.id,
            visible: true,
            blendMode: layer.blendMode,
            transform: worldTransform,
            video: resolvedVideo,
            mask: resolveMask(layer.masks, frame),
            masks: resolveMasks(layer.masks, frame),
            motionBlur,
            shadow,
            glow,
            blur,
            layerType: 'video',
          });
          // Frame-mix: expand into a second video layer at frameB, drawn on top at opacity = mix, so
          // the two adjacent source frames cross-dissolve through the normal image pipeline (no shader
          // change). Reuses the cloner-stamp pattern; a synthetic id keys its own decoded texture.
          // Skipped for interp:'flow' - there the renderer's optical-flow warp pre-pass already blends
          // both source frames into the single base texture, so a second overlay would double-composite.
          if (resolvedVideo.sourceFrameB != null && resolvedVideo.blendMix && resolvedVideo.interp !== 'flow') {
            resolvedLayers.push({
              id: `${layer.id}:fb`,
              visible: true,
              blendMode: layer.blendMode,
              transform: { ...worldTransform, opacity: worldTransform.opacity * resolvedVideo.blendMix },
              video: { ...resolvedVideo, sourceFrame: resolvedVideo.sourceFrameB, sourceFrameB: undefined, blendMix: undefined },
              mask: resolveMask(layer.masks, frame),
              masks: resolveMasks(layer.masks, frame),
              layerType: 'video',
            });
          }
        }
      } else if (layer.type === 'image') {
        const resolvedImage = resolveImageLayer(layer);
        resolvedLayers.push({
          id: layer.id,
          visible: true,
          blendMode: layer.blendMode,
          transform: worldTransform,
          image: resolvedImage,
          mask: resolveMask(layer.masks, frame),
          masks: resolveMasks(layer.masks, frame),
          motionBlur,
          shadow,
          glow,
          blur,
          layerType: 'image',
        });
      } else if (layer.type === 'shape') {
        const shapeLayer = layer as ShapeLayer;
        if (!shapeLayer.shape) continue;
        const resolvedShape = resolveShapeLayer(shapeLayer, frame, getStyle);
        const rMask = resolveMask(layer.masks, frame);
        const rMasks = resolveMasks(layer.masks, frame);
        // In-shape Repeater (B8d): expand into N copies at accumulated transforms (cloner-stamp
        // pattern - each copy is a resolved shape layer reusing the SAME geometry). Absent/disabled →
        // a single copy with the world transform untouched (byte-identical).
        const rep = shapeLayer.repeater;
        const copies = rep && rep.enabled
          ? repeaterTransforms(
              Math.min(MAX_REPEATER_COPIES, evaluateNumber(rep.copies, frame)),
              evaluateNumber(rep.offsetX, frame),
              evaluateNumber(rep.offsetY, frame),
              evaluateNumber(rep.rotation, frame),
              evaluateNumber(rep.scale, frame),
              evaluateNumber(rep.startOpacity, frame),
              evaluateNumber(rep.endOpacity, frame),
            )
          : SINGLE_COPY;
        for (let ci = 0; ci < copies.length; ci++) {
          const c = copies[ci];
          const t = ci === 0 && copies === SINGLE_COPY
            ? worldTransform
            : {
                ...worldTransform,
                positionX: worldTransform.positionX + c.dx,
                positionY: worldTransform.positionY + c.dy,
                rotation: worldTransform.rotation + c.rotation,
                scaleX: worldTransform.scaleX * c.scale,
                scaleY: worldTransform.scaleY * c.scale,
                opacity: worldTransform.opacity * c.opacity,
              };
          resolvedLayers.push({
            id: ci === 0 ? layer.id : `${layer.id}:rep${ci}`,
            visible: true,
            blendMode: layer.blendMode,
            transform: t,
            shape: resolvedShape,
            mask: rMask,
            masks: rMasks,
            motionBlur,
            shadow,
            glow,
            blur,
            layerType: 'shape',
          });
        }
      } else if (layer.type === 'particle') {
        const localFrame = frame - layer.inPoint;
        resolvedLayers.push({
          id: layer.id,
          visible: true,
          blendMode: layer.blendMode,
          transform: worldTransform,
          particle: {
            emitterConfigJSON: layer.particle.emitterConfig,
            seed: layer.particle.seed,
            localFrame,
          },
          layerType: 'particle',
        });
      } else if (layer.type === 'animationItem') {
        try {
          const itemConfig = JSON.parse(layer.animationItem.configJSON);
          const dataSource = JSON.parse(layer.animationItem.dataSourceJSON);
          const elements = evaluateAnimationItem(itemConfig, dataSource, frame, layer.inPoint, layer.outPoint);
          for (let ei = 0; ei < elements.length; ei++) {
            const el = elements[ei];
            const elTransform: ResolvedTransform = {
              positionX: worldTransform.positionX + el.transform.x,
              positionY: worldTransform.positionY + el.transform.y,
              rotation: worldTransform.rotation + el.transform.rotation,
              scaleX: worldTransform.scaleX * el.transform.scaleX,
              scaleY: worldTransform.scaleY * el.transform.scaleY,
              anchorX: el.transform.anchorX * (el.shape?.width ?? 0),
              anchorY: el.transform.anchorY * (el.shape?.height ?? 0),
              opacity: worldTransform.opacity * el.transform.opacity,
              positionZ: worldTransform.positionZ,
              rotationX: worldTransform.rotationX,
              rotationY: worldTransform.rotationY,
            };
            if (el.kind === 'shape' && el.shape) {
              resolvedLayers.push({
                id: `${layer.id}_el${ei}`,
                visible: true,
                blendMode: layer.blendMode,
                transform: elTransform,
                shape: {
                  renderType: el.shape.type === 'arc' ? 'circle' : el.shape.type === 'circle' ? 'circle' : 'rectangle',
                  width: el.shape.width,
                  height: el.shape.height,
                  fillColor: el.shape.fillColor,
                  strokeColor: el.shape.strokeColor,
                  strokeWidth: el.shape.strokeWidth,
                  borderRadius: el.shape.cornerRadius,
                  radius: el.shape.type === 'circle' || el.shape.type === 'arc' ? el.shape.width / 2 : 0,
                  points: 0, outerRadius: 0, innerRadius: 0,
                  vertices: [], closed: true, lineCap: 'round', lineJoin: 'round',
                },
                layerType: 'shape',
              });
            } else if (el.kind === 'text' && el.text) {
              // Animation-item labels are plain single-run strings (no rich-text
              // spans / bounding box), so they resolve as auto-sized point text.
              const textObj: ResolvedText = {
                content: el.text.content,
                mode: 'point',
                boxWidth: 300,
                boxHeight: 200,
                fontFamily: el.text.fontFamily,
                fontWeight: el.text.fontWeight,
                fontStyle: 'normal',
                fontSize: el.text.fontSize,
                lineHeight: 1.2,
                letterSpacing: 0,
                fillColor: el.text.fillColor,
                strokeColor: [0, 0, 0, 0],
                strokeWidth: 0,
                textAlign: el.text.align,
                underline: false,
                strikethrough: false,
                measuredWidth: 0,
                measuredHeight: 0,
              };
              const measured = measureText(textObj);
              textObj.measuredWidth = measured.width;
              textObj.measuredHeight = measured.height;
              resolvedLayers.push({
                id: `${layer.id}_el${ei}`,
                visible: true,
                blendMode: layer.blendMode,
                // elTransform anchors off el.shape, which text elements lack;
                // scale the element's anchor fraction by the measured text box
                // so a 0.5/0.5 label centres on its transform.
                transform: {
                  ...elTransform,
                  anchorX: el.transform.anchorX * measured.width,
                  anchorY: el.transform.anchorY * measured.height,
                },
                text: textObj,
                layerType: 'text',
              });
            }
          }
        } catch { /* skip on parse error */ }
      } else if (layer.type === 'fieldSampled') {
        const localFrame = frame - layer.inPoint;
        // The field's on-canvas size lives in the serialized config - parse it (with the factory
        // default as fallback) so the renderer sizes the quad to the sample, not the whole comp.
        let canvasWidth = 600, canvasHeight = 800;
        try {
          const cfg = JSON.parse(layer.fieldSampled.configJSON) as { canvasWidth?: number; canvasHeight?: number };
          if (Number.isFinite(cfg?.canvasWidth) && (cfg.canvasWidth as number) > 0) canvasWidth = cfg.canvasWidth as number;
          if (Number.isFinite(cfg?.canvasHeight) && (cfg.canvasHeight as number) > 0) canvasHeight = cfg.canvasHeight as number;
        } catch { /* keep defaults */ }
        resolvedLayers.push({
          id: layer.id,
          visible: true,
          blendMode: layer.blendMode,
          transform: worldTransform,
          fieldSampled: {
            configJSON: layer.fieldSampled.configJSON,
            localFrame,
            canvasWidth,
            canvasHeight,
          },
          layerType: 'fieldSampled',
        });
      } else if (layer.type === 'generativePattern') {
        const localFrame = frame - layer.inPoint;
        resolvedLayers.push({
          id: layer.id,
          visible: true,
          blendMode: layer.blendMode,
          transform: worldTransform,
          generativePattern: {
            configJSON: layer.generativePattern.configJSON,
            localFrame,
            width: evaluateNumber(layer.width, frame),
            height: evaluateNumber(layer.height, frame),
            scale: evaluateNumber(layer.patternAnim.scale, frame),
            rotation: evaluateNumber(layer.patternAnim.rotation, frame),
            warp: evaluateNumber(layer.patternAnim.warp, frame),
            contrast: evaluateNumber(layer.patternAnim.contrast, frame),
          },
          masks: resolveMasks(layer.masks, frame),
          layerType: 'generativePattern',
        });
      } else if (layer.type === 'lottieIcon') {
        const lottieLayer = layer as LottieIconLayer;
        const localFrame = frame - layer.inPoint + lottieLayer.lottieIcon.startFrame;
        const lottieFrameRate = lottieLayer.lottieIcon.frameRate || 30;
        const compositionFps = settings.frameRate || 30;
        const scaledFrame = Math.floor(localFrame * (lottieFrameRate / compositionFps));
        resolvedLayers.push({
          id: layer.id,
          visible: true,
          blendMode: layer.blendMode,
          transform: worldTransform,
          lottieIcon: {
            jsonPath: lottieLayer.lottieIcon.jsonPath,
            jsonData: lottieLayer.lottieIcon.jsonData,
            totalFrames: lottieLayer.lottieIcon.totalFrames,
            frameRate: lottieFrameRate,
            sourceWidth: lottieLayer.lottieIcon.sourceWidth,
            sourceHeight: lottieLayer.lottieIcon.sourceHeight,
            localFrame: scaledFrame,
            color: lottieLayer.lottieIcon.color,
          },
          mask: resolveMask(layer.masks, frame),
          masks: resolveMasks(layer.masks, frame),
          motionBlur,
          shadow,
          glow,
          blur,
          layerType: 'lottieIcon',
        });
      } else if (layer.type === 'cloner') {
        // Resolve the cloner to per-instance transforms. The renderer (later)
        // consumes `cloner.instances` via the instanced-shape or texture-stamp path.
        const cloner = layer as ClonerLayer;
        const sourceLayerId = cloner.sourceRef.type === 'layer' ? cloner.sourceRef.layerId : null;
        const source = sourceLayerId ? _layerById.get(sourceLayerId) : undefined;
        const sdfTypes = ['rectangle', 'circle', 'star'];
        const isSdf = source?.type === 'shape' && sdfTypes.includes((source as ShapeLayer).shape?.type ?? '');
        // Data-bound sources force the full per-instance render path regardless of type.
        const isDataBound = !!(cloner.dataBinding && cloner.dataBinding.data.length > 0);
        const renderPath = selectClonerRenderPath({ layerType: source?.type ?? 'image', isSdfShape: isSdf, isDataBound });
        // Per-instance source animation reuses the EXISTING transform evaluator at
        // each instance's staggered local frame - no keyframe re-implementation.
        const instances = computeInstanceTransforms(cloner, frame, {
          fps: settings.frameRate,
          getMotionPath: (id) => motionPaths.find((p) => p.id === id),
          getField: (ref) => resolveClonerField(ref, layers),
          evaluateSourceTransform: source
            ? (localFrame) => {
                const st = resolveTransform(source.transform, localFrame);
                return {
                  position: { x: st.positionX, y: st.positionY, z: 0 },
                  rotationDegrees: { x: 0, y: 0, z: st.rotation },
                  scale: { x: st.scaleX, y: st.scaleY, z: 1 },
                  opacity: st.opacity,
                };
              }
            : undefined,
        });
        // Data-bound source: apply the instance-override mechanism (core/overrides,
        // via buildDataBoundSources) to produce one content-overridden source per
        // instance - the inputs the full per-instance render path renders.
        const instanceSources = isDataBound && source
          ? buildDataBoundSources(source, cloner.dataBinding!, instances.length)
          : undefined;
        resolvedLayers.push({
          id: layer.id,
          visible: true,
          blendMode: layer.blendMode,
          transform: worldTransform,
          cloner: { renderPath, sourceLayerId, instances, instanceSources },
          layerType: 'cloner',
        });
      } else if (layer.type === 'precomp') {
        // Precomp: recursively resolve the referenced sub-composition at a time-
        // remapped local frame into its own nested RenderFrame, for the renderer to
        // render offscreen and composite. Guards: registry present, no reference
        // cycle (visited set), and a hard depth cap.
        const precomp = layer as PrecompLayer;
        const getComposition = ctx?.getComposition;
        const depth = ctx?.depth ?? 0;
        const visited = ctx?.visited ?? EMPTY_VISITED;
        const sub = getComposition?.(precomp.compositionId);
        let nested: RenderFrame | null = null;
        // This composition + its ancestors are "in progress"; if the referenced
        // sub-composition is among them, it's a cycle (incl. self-reference) → stop.
        const inProgress = visited.has(composition.id) ? visited : new Set(visited).add(composition.id);
        if (sub && depth < MAX_PRECOMP_DEPTH && !inProgress.has(precomp.compositionId)) {
          const subLocalFrame = precompLocalFrame(precomp, frame, settings.frameRate, sub);
          // RE-ENTRANCY FIX: the recursive resolveFrame reassigns the module-level
          // layout maps + the layer-by-id map; save and restore them so the outer
          // comp's still-running loop keeps reading its own offsets/sizes/layers.
          const savedOffsets = _layoutOffsets;
          const savedSizes = _layoutContainerSizes;
          const savedById = _layerById;
          nested = resolveFrame(sub, subLocalFrame, { getComposition, depth: depth + 1, visited: inProgress });
          _layoutOffsets = savedOffsets;
          _layoutContainerSizes = savedSizes;
          _layerById = savedById;
        }
        resolvedLayers.push({
          id: layer.id,
          visible: true,
          blendMode: layer.blendMode,
          transform: worldTransform,
          mask: resolveMask(precomp.masks, frame),
          masks: resolveMasks(precomp.masks, frame),
          motionBlur,
          shadow,
          glow,
          blur,
          precomp: {
            compositionId: precomp.compositionId,
            renderFrame: nested,
            width: sub?.settings.width ?? settings.width,
            height: sub?.settings.height ?? settings.height,
          },
          layerType: 'precomp',
        });
      }
    } catch (e) {
      console.warn(`[FlashFX] Layer evaluation failed for "${layer.id}" (${layer.type}):`, e);
    }

    clearExpressionContext();
  }

  const bindings = composition.proceduralBindings || [];
  if (bindings.length > 0) {
    const bindingsByLayer = new Map<string, typeof bindings[0]>();
    for (const b of bindings) {
      if (b.enabled) bindingsByLayer.set(b.layerId, b);
    }
    for (const resolved of resolvedLayers) {
      const binding = bindingsByLayer.get(resolved.id);
      if (!binding) continue;
      const output = evaluateProceduralBinding(binding, frame);
      if (!output) continue;
      if (output.kind === 'transform') {
        const r = output.result;
        resolved.proceduralLoop = { kind: 'transform', transform: r };
        resolved.transform = {
          ...resolved.transform,
          positionX: resolved.transform.positionX + r.x,
          positionY: resolved.transform.positionY + r.y,
          rotation: resolved.transform.rotation + r.rotation,
          scaleX: resolved.transform.scaleX * r.scaleX,
          scaleY: resolved.transform.scaleY * r.scaleY,
          opacity: resolved.transform.opacity * r.opacity,
        };
      } else if (output.kind === 'gridArray') {
        resolved.proceduralLoop = { kind: 'gridArray', grid: output.result };
      } else if (output.kind === 'tileScroll') {
        resolved.proceduralLoop = { kind: 'tileScroll', tile: output.result };
      }
    }
  }

  const anchorEdges = composition.anchorEdges || [];
  if (anchorEdges.length > 0) {
    const transformMap = new Map<string, ResolvedTransform>();
    for (const resolved of resolvedLayers) {
      transformMap.set(resolved.id, resolved.transform);
    }
    const updatedTransforms = evaluateAnchoring(
      anchorEdges,
      transformMap,
      frame,
      settings.frameRate,
      settings.durationFrames,
    );
    for (const resolved of resolvedLayers) {
      const updated = updatedTransforms.get(resolved.id);
      if (updated) resolved.transform = updated;
    }
  }

  const physicsBindings = composition.physicsBindings || [];
  if (physicsBindings.length > 0) {
    for (const binding of physicsBindings) {
      if (!binding.enabled || binding.role !== 'dynamic') continue;
      if (frame < binding.birthFrame) continue;
      const baked = sampleBakedFrame(binding.layerId, frame);
      if (!baked) continue;
      const resolved = resolvedLayers.find((l) => l.id === binding.layerId);
      if (resolved) {
        resolved.transform = {
          ...resolved.transform,
          positionX: baked.x,
          positionY: baked.y,
          rotation: baked.rotation * (180 / Math.PI),
        };
      }
    }
  }

  // ── Cloner expansion ──────────────────────────────────────────────────────────────────────
  // Turn each resolved cloner into per-instance STAMPS of its (already-resolved) source layer,
  // in the cloner's z-position, and hide the source (it lives inside the cloner, C4D-style). The
  // pure engine already produced `cloner.instances` (final per-instance position/rotation/scale/
  // opacity/tint, incl. the source's own animation + effectors); here we just clone the source's
  // resolved content payload at each instance transform. Reusing the resolved source means no
  // re-resolution and no cloner-specific code in the renderer (which previously mis-bucketed the
  // undrawable cloner layer as a shape and crashed).
  if (resolvedLayers.some((l) => l.layerType === 'cloner')) {
    const stampsByCloner = new Map<string, ResolvedLayer[]>();
    const hiddenSourceIds = new Set<string>();
    for (const cl of resolvedLayers) {
      if (cl.layerType !== 'cloner' || !cl.cloner) continue;
      const srcId = cl.cloner.sourceLayerId;
      const src = srcId ? resolvedLayers.find((l) => l.id === srcId && l.layerType !== 'cloner') : undefined;
      const stamps: ResolvedLayer[] = [];
      if (src && srcId) {
        hiddenSourceIds.add(srcId);
        for (const inst of cl.cloner.instances) {
          // Instance transform (relative to the cloner), composed under the cloner's world
          // transform. anchor 0 → the instance position IS the stamp centre.
          const child: ResolvedTransform = {
            positionX: inst.position.x, positionY: inst.position.y,
            rotation: inst.rotationDegrees.z,
            scaleX: inst.scale.x, scaleY: inst.scale.y,
            anchorX: 0, anchorY: 0,
            opacity: inst.opacity,
            positionZ: 0, rotationX: 0, rotationY: 0,
          };
          const stamp: ResolvedLayer = {
            ...src,
            id: `${cl.id}#${inst.index}`,
            transform: composeTransforms(cl.transform, child),
            // instances don't inherit the source's masks (mask coords are absolute - they'd
            // pin every clone to the source's spot). Default sources have none anyway.
            mask: undefined,
            masks: undefined,
          };
          // Multiplicative colour tint on shape fills (effectors can drive it; identity = no-op).
          const t = inst.colorTint;
          if (src.shape && (t.r !== 1 || t.g !== 1 || t.b !== 1)) {
            const f = src.shape.fillColor;
            stamp.shape = { ...src.shape, fillColor: [f[0] * t.r, f[1] * t.g, f[2] * t.b, f[3]] as Vec4 };
          }
          stamps.push(stamp);
        }
      }
      stampsByCloner.set(cl.id, stamps);
    }
    // Rebuild in place, preserving z-order: each cloner → its stamps; sources removed.
    const rebuilt: ResolvedLayer[] = [];
    for (const rl of resolvedLayers) {
      if (hiddenSourceIds.has(rl.id) && rl.layerType !== 'cloner') continue;
      if (rl.layerType === 'cloner') { rebuilt.push(...(stampsByCloner.get(rl.id) ?? [])); continue; }
      rebuilt.push(rl);
    }
    resolvedLayers.length = 0;
    resolvedLayers.push(...rebuilt);
  }

  // 2.5D (M1): attach world matrices to any 3D layers (renderer consumes them in M2). Dormant
  // until the M3 is3D toggle exists; safe no-op for all-2D comps (the common case).
  if (struct.hasThreeDLayers) {
    for (const rl of resolvedLayers) {
      const src = _layerById.get(rl.id);
      if (src?.is3D) { rl.worldMatrix = worldMatrixFor(rl.id, frame); rl.is3D = true; }
    }
  }

  // Track mattes (B10b): pair each matted source layer with the layer directly above (pure), then
  // record `matte` / `consumedAsMatte` on the resolved layers by source id. This is metadata ONLY -
  // rendering stays byte-identical until the renderer's matte composite pass (browser-gated) consumes
  // it; a no-op when no layer has a trackMatte, so all existing comps are unaffected.
  const mattePairing = pairTrackMattes(sortedLayers.map((l) => ({ id: l.id, trackMatte: (l as { trackMatte?: TrackMatteMode }).trackMatte })));
  if (Object.keys(mattePairing.matted).length > 0) {
    for (const rl of resolvedLayers) {
      const ref = mattePairing.matted[rl.id];
      if (ref) rl.matte = ref;
      if (mattePairing.consumed.has(rl.id)) rl.consumedAsMatte = true;
    }
  }

  return {
    frameNumber: frame,
    totalFrames: settings.durationFrames,
    frameRate: settings.frameRate,
    width: settings.width,
    height: settings.height,
    backgroundColor: settings.backgroundColor,
    background: composition.background,
    layers: resolvedLayers,
    // The active camera (topmost enabled camera layer, else a comp-framing default).
    camera: resolveActiveCamera(composition, sortedLayers, frame),
  };
}

export function buildPhysicsEvaluator(composition: Composition): (layerId: string, frame: number) => { x: number; y: number; rotation: number; width: number; height: number } {
  const { layers } = composition;
  const motionPaths = composition.motionPaths || [];
  const layerMap = new Map(layers.map((l) => [l.id, l]));

  return (layerId: string, frame: number) => {
    const layer = layerMap.get(layerId);
    if (!layer) return { x: 0, y: 0, rotation: 0, width: 100, height: 100 };

    // worldTransformAt → getParentTransform reads the module-level _layerById; set
    // it to THIS composition's map so parenting resolves correctly when the physics
    // bake runs outside a resolveFrame call (worldTransformAt is synchronous, so this
    // set-then-use is atomic and can't be clobbered by an interleaving resolve).
    _layerById = layerMap;
    const transform = worldTransformAt(layer, layers, motionPaths, frame);
    let width = 100;
    let height = 100;

    if (layer.type === 'shape') {
      const shape = (layer as ShapeLayer).shape;
      switch (shape.type) {
        case 'rectangle':
          width = evaluateNumber(shape.width, frame);
          height = evaluateNumber(shape.height, frame);
          break;
        case 'circle': {
          const r = evaluateNumber(shape.radius, frame);
          width = r * 2;
          height = r * 2;
          break;
        }
        case 'star': {
          const outer = evaluateNumber(shape.outerRadius, frame);
          width = outer * 2;
          height = outer * 2;
          break;
        }
        case 'polygon': {
          const verts = shape.vertices;
          if (verts.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const v of verts) {
              const [x, y] = v.position;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
            width = maxX - minX;
            height = maxY - minY;
          }
          break;
        }
      }
    } else if (layer.type === 'text') {
      width = 200;
      height = 40;
    } else if (layer.type === 'image') {
      const img = (layer as ImageLayer).image;
      width = img.sourceWidth ?? 200;
      height = img.sourceHeight ?? 200;
    } else if (layer.type === 'video') {
      width = 200;
      height = 200;
    }

    return {
      x: transform.positionX,
      y: transform.positionY,
      rotation: transform.rotation * (Math.PI / 180),
      width,
      height,
    };
  };
}
