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
  MotionPath,
  LayoutObjectLayer,
  LayoutContainerLayer,
} from './types';
import type { ResolvedMotionBlur, ResolvedShadow, ResolvedBlur, LayerShadow, LayerGlow, LayerBlur, ResolvedGlow } from './types';
import { measureText } from '../engine/textAtlas';
import { evaluateMotionPathAtFrame } from './motionPath';
import { computeInstanceTransforms, selectClonerRenderPath, buildDataBoundSources } from '../cloner';
import type { ClonerLayer } from '../cloner/types';
import { rasterizeField, type FieldGrid } from '../field-sampling/fields';
import { precompLocalFrame, MAX_PRECOMP_DEPTH } from './precomp';
import type { ResolveContext } from './precomp';
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
let _layoutOffsets: Map<string, { x: number; y: number }> = new Map();
let _layoutContainerSizes: Map<string, { width: number; height: number }> = new Map();
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

const DEFAULT_SHUTTER_ANGLE = 180;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function cubicBezier(t: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  function sampleX(tt: number): number {
    return ((ax * tt + bx) * tt + cx) * tt;
  }

  function sampleY(tt: number): number {
    return ((ay * tt + by) * tt + cy) * tt;
  }

  function solveCurveX(x: number): number {
    let tt = x;
    for (let i = 0; i < 8; i++) {
      const currentX = sampleX(tt) - x;
      if (Math.abs(currentX) < 1e-7) return tt;
      const dx = (3 * ax * tt + 2 * bx) * tt + cx;
      if (Math.abs(dx) < 1e-7) break;
      tt -= currentX / dx;
    }
    return tt;
  }

  return sampleY(solveCurveX(t));
}

function springInterpolate(t: number): number {
  const damping = 0.7;
  const frequency = 4;
  return 1 - Math.exp(-damping * t * 10) * Math.cos(frequency * t * Math.PI * 2);
}

function interpolateValue(
  from: number,
  to: number,
  t: number,
  kf: Keyframe
): number {
  let progress: number;

  switch (kf.interpolation) {
    case 'hold':
      return from;
    case 'linear':
      progress = t;
      break;
    case 'bezier':
      progress = cubicBezier(
        t,
        kf.handleOut[0] || 0.25,
        kf.handleOut[1] || 0.1,
        kf.handleIn[0] || 0.75,
        kf.handleIn[1] || 0.9
      );
      break;
    case 'spring':
      progress = springInterpolate(t);
      break;
    default:
      progress = t;
  }

  return from + (to - from) * progress;
}

export function evaluateProperty(prop: AnimatableProperty, frame: number): number | Vec2 {
  if (!prop) return 0;
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
      keyframedValue = [
        interpolateValue(fromVec[0], toVec[0], t, prevKf),
        interpolateValue(fromVec[1], toVec[1], t, prevKf),
      ];
    } else {
      keyframedValue = interpolateValue(prevKf.value as number, nextKf.value as number, t, prevKf);
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
  };
}

function resolveShapeLayer(layer: ShapeLayer, frame: number): ResolvedShape {
  const shape = layer.shape;
  const defaultColor: Vec4 = [0.5, 0.5, 0.5, 1];
  const fillColor = resolveDominantColor(layer.materialConfig, shape.fillColor ?? defaultColor);
  const strokeColor = resolveDominantColor(layer.strokeMaterialConfig, shape.strokeColor ?? [0, 0, 0, 1]);
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
      base.vertices = shape.vertices;
      base.closed = shape.closed;
      base.lineCap = shape.lineCap ?? 'butt';
      base.lineJoin = shape.lineJoin ?? 'miter';
      // Compute bounding box for width/height
      if (shape.vertices.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const v of shape.vertices) {
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
  const group = layers.find((l) => l.id === groupId);
  if (!group) return true;
  if (!group.visible) return false;
  if (frame < group.inPoint || frame >= group.outPoint) return false;
  if (group.parentId) return isGroupVisible(group.parentId, layers, frame);
  return true;
}

function getParentTransform(layerId: string, layers: Layer[], frame: number): ResolvedTransform {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer || !layer.parentId) {
    const layoutOffset = _layoutOffsets.get(layerId);
    if (layoutOffset) {
      return { positionX: layoutOffset.x, positionY: layoutOffset.y, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1 };
    }
    return { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1 };
  }
  const parent = layers.find((l) => l.id === layer.parentId);
  if (!parent) {
    return { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1 };
  }

  const parentLocal = resolveTransform(parent.transform, frame);
  const grandparent = getParentTransform(parent.id, layers, frame);
  let composed = composeTransforms(grandparent, parentLocal);

  const layoutOffset = _layoutOffsets.get(layerId);
  if (layoutOffset) {
    composed = { ...composed, positionX: composed.positionX + layoutOffset.x, positionY: composed.positionY + layoutOffset.y };
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
  };
}

function resolveTextLayer(layer: TextLayer, frame: number): ResolvedText {
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
    fillColor: style.color,
    strokeColor: style.strokeColor,
    strokeWidth: evaluateNumber(layer.animOverrides.strokeWidth, frame),
    textAlign: layer.layoutConfig.horizontalAlign,
    underline: style.underline,
    strikethrough: style.strikethrough,
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
  const localFrame = frame - layer.inPoint + v.startOffset;
  const timeInSeconds = localFrame / compositionFrameRate;
  const sourceFrame = Math.floor(timeInSeconds * v.sourceFrameRate * v.playbackRate);
  const totalSourceFrames = Math.round(v.sourceDuration * v.sourceFrameRate);
  const clampedFrame = Math.max(0, Math.min(sourceFrame, totalSourceFrames - 1));

  return {
    assetId: v.assetId,
    sourceFrame: clampedFrame,
    sourceWidth: v.sourceWidth,
    sourceHeight: v.sourceHeight,
    playbackRate: v.playbackRate,
    playbackMode: v.playbackMode,
    proxyScale: v.proxyScale,
  };
}

function resolveImageLayer(layer: ImageLayer): ResolvedImage {
  // Effects are static scalars for now (params copied through). When they become
  // animatable, evaluate each param here via evaluateNumber(prop, frame) — the
  // renderer and shader stay unchanged.
  const effects = (layer.effects ?? [])
    .filter((e) => e.enabled !== false)
    .map((e) => ({ type: e.type, params: e.params }));
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
  };
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
// moves and anything else that changes the transform — without inspecting
// keyframes directly. Returns undefined when blur is disabled or the layer is
// effectively static, so the renderer keeps its zero-overhead fast path.
function computeMotionBlur(
  layer: Layer,
  current: ResolvedTransform,
  layers: Layer[],
  motionPaths: MotionPath[],
  frame: number,
): ResolvedMotionBlur | undefined {
  if (!getMotionBlur(layer)) return undefined;

  const shutter = clamp(layer.motionBlurShutter ?? DEFAULT_SHUTTER_ANGLE, 0, 360);
  if (shutter <= 0) return undefined;

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

  return { shutter, pivotX, pivotY, vx, vy, omega, scaleRateX, scaleRateY };
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
// stable/deterministic). The async worker path isn't needed here — CPU rasterization
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

export function resolveFrame(composition: Composition, frame: number, ctx?: ResolveContext): RenderFrame {
  const { settings, layers } = composition;
  const motionPaths = composition.motionPaths || [];
  const resolvedLayers: ResolvedLayer[] = [];
  // Sort layers by track order: highest order first so that top tracks (lowest
  // order) render last (on top). Within the same track, ties break by clip
  // in-point (later in-points draw last → on top of earlier ones), giving
  // multi-clip lanes a deterministic stacking when their time ranges abut.
  const tracks = composition.tracks || [];
  const trackOrderMap = new Map(tracks.map((t) => [t.id, t.order]));
  const hiddenTrackIds = new Set(tracks.filter((t) => !t.visible).map((t) => t.id));
  const sortedLayers = [...layers].sort((a, b) => {
    const orderA = a.trackId ? (trackOrderMap.get(a.trackId) ?? 0) : 0;
    const orderB = b.trackId ? (trackOrderMap.get(b.trackId) ?? 0) : 0;
    if (orderA !== orderB) return orderB - orderA;
    return a.inPoint - b.inPoint;
  });

  // Pre-compute layout offsets for children of active layout containers
  _layoutOffsets = new Map();
  _layoutContainerSizes = new Map();
  for (const layer of layers) {
    if (layer.type !== 'hbox' && layer.type !== 'vbox' && layer.type !== 'grid') continue;
    if (!layer.visible) continue;
    if (frame < layer.inPoint || frame >= layer.outPoint) continue;
    const layoutLayer = layer as LayoutObjectLayer;
    const children: ChildMeasurement[] = layoutLayer.children
      .map((childId) => {
        const child = layers.find((l) => l.id === childId);
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
    for (const [childId, pos] of Object.entries(computedData.childPositions)) {
      _layoutOffsets.set(childId, { x: pos.x, y: pos.y });
    }
  }

  for (let i = 0; i < sortedLayers.length; i++) {
    const layer = sortedLayers[i];
    if (layer.type === 'group') continue;
    if (layer.type === 'audio') continue;
    if (!layer.visible) continue;
    if (layer.trackId && hiddenTrackIds.has(layer.trackId)) continue;
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
      const motionBlur = computeMotionBlur(layer, worldTransform, layers, motionPaths, frame);
      const shadow = computeShadow((layer as { shadow?: LayerShadow }).shadow, worldTransform);
      const glow = computeGlow((layer as { glow?: LayerGlow }).glow);
      const blur = computeBlur((layer as { blur?: LayerBlur }).blur);

      if (layer.type === 'text') {
        const resolvedText = resolveTextLayer(layer, frame);
        resolvedLayers.push({
          id: layer.id,
          visible: true,
          blendMode: layer.blendMode,
          transform: worldTransform,
          text: resolvedText,
          mask: resolveMask(layer.masks, frame),
          masks: resolveMasks(layer.masks, frame),
          motionBlur,
          shadow,
          glow,
          blur,
          layerType: 'text',
        });
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
        resolvedLayers.push({
          id: layer.id,
          visible: true,
          blendMode: layer.blendMode,
          transform: worldTransform,
          shape: resolveShapeLayer(shapeLayer, frame),
          mask: resolveMask(layer.masks, frame),
          masks: resolveMasks(layer.masks, frame),
          motionBlur,
          shadow,
          glow,
          blur,
          layerType: 'shape',
        });
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
        resolvedLayers.push({
          id: layer.id,
          visible: true,
          blendMode: layer.blendMode,
          transform: worldTransform,
          fieldSampled: {
            configJSON: layer.fieldSampled.configJSON,
            localFrame,
          },
          layerType: 'fieldSampled',
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
        const source = sourceLayerId ? layers.find((l) => l.id === sourceLayerId) : undefined;
        const sdfTypes = ['rectangle', 'circle', 'star'];
        const isSdf = source?.type === 'shape' && sdfTypes.includes((source as ShapeLayer).shape?.type ?? '');
        // Data-bound sources force the full per-instance render path regardless of type.
        const isDataBound = !!(cloner.dataBinding && cloner.dataBinding.data.length > 0);
        const renderPath = selectClonerRenderPath({ layerType: source?.type ?? 'image', isSdfShape: isSdf, isDataBound });
        // Per-instance source animation reuses the EXISTING transform evaluator at
        // each instance's staggered local frame — no keyframe re-implementation.
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
        // instance — the inputs the full per-instance render path renders.
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
          // layout maps; save and restore them so the outer comp's still-running
          // loop keeps reading its own offsets/sizes.
          const savedOffsets = _layoutOffsets;
          const savedSizes = _layoutContainerSizes;
          nested = resolveFrame(sub, subLocalFrame, { getComposition, depth: depth + 1, visited: inProgress });
          _layoutOffsets = savedOffsets;
          _layoutContainerSizes = savedSizes;
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

  return {
    frameNumber: frame,
    totalFrames: settings.durationFrames,
    width: settings.width,
    height: settings.height,
    backgroundColor: settings.backgroundColor,
    background: composition.background,
    layers: resolvedLayers,
  };
}

export function buildPhysicsEvaluator(composition: Composition): (layerId: string, frame: number) => { x: number; y: number; rotation: number; width: number; height: number } {
  const { layers } = composition;
  const motionPaths = composition.motionPaths || [];
  const layerMap = new Map(layers.map((l) => [l.id, l]));

  return (layerId: string, frame: number) => {
    const layer = layerMap.get(layerId);
    if (!layer) return { x: 0, y: 0, rotation: 0, width: 100, height: 100 };

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
