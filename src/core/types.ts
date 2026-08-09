// The cloner is a first-class layer; its data-model types live in the feature
// module (src/cloner) and are imported type-only here (erased at runtime — no
// runtime dependency of core on the feature module).
import type { ClonerLayer, InstanceTransform } from '../cloner/types';
import type { SharedStyle } from './styles'; // M21 — type-only (erased; no runtime cycle)
import type { ClonerRenderPath } from '../cloner/renderPath';
// M14 reframe constraints — type-only (erased at runtime; reframe.ts imports only `type Vec2`
// back from here, so this cross-reference has no runtime cycle).
import type { LayerConstraints } from './reframe';
// 2.5D — type-only (erased at runtime). camera3d imports ResolvedTransform back from here; a
// type-only cycle has no runtime dependency.
import type { Mat4 } from './mat4';
import type { ResolvedCamera } from './camera3d';

export type Vec2 = [number, number];
export type Vec4 = [number, number, number, number];

export type InterpolationType = 'linear' | 'bezier' | 'hold' | 'spring';

export interface Keyframe {
  frame: number;
  value: number | Vec2;
  interpolation: InterpolationType;
  handleIn: Vec2;
  handleOut: Vec2;
  /** Bezier tangent mode for the graph editor: 'continuous' keeps handles collinear, 'broken' independent. */
  tangentMode?: 'continuous' | 'broken';
}

export interface AnimatableProperty {
  id: string;
  name: string;
  valueType: 'number' | 'vec2';
  defaultValue: number | Vec2;
  keyframes: Keyframe[];
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'add';

export type BackgroundBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'softLight'
  | 'add'
  | 'darken'
  | 'lighten';

export type BackgroundLayerType = 'solid' | 'linear' | 'radial';

export interface GradientStop {
  color: [number, number, number];
  position: number;
  opacity: number;
}

export interface BackgroundLayer {
  id: string;
  enabled: boolean;
  opacity: number;
  blendMode: BackgroundBlendMode;
  type: BackgroundLayerType;
  stops: GradientStop[];
  angle: number;
  centerX: number;
  centerY: number;
  radius: number;
}

export interface Background {
  layers: BackgroundLayer[];
}

export interface Transform {
  position: AnimatableProperty;
  rotation: AnimatableProperty;
  scale: AnimatableProperty;
  anchorPoint: AnimatableProperty;
  opacity: AnimatableProperty;
  // --- 2.5D (optional, default 0; present only on 3D-enabled layers). `rotation` above stays
  // the Z rotation (screen-plane spin) for full backward compatibility; these add depth. ---
  positionZ?: AnimatableProperty; // depth offset along the camera's -Z (into the screen)
  rotationX?: AnimatableProperty; // pitch (degrees)
  rotationY?: AnimatableProperty; // yaw (degrees)
}

export type TextAlign = 'left' | 'center' | 'right';
export type TextMode = 'point' | 'box';

export type TextBoundingBox =
  | { type: 'auto' }
  | { type: 'fixed'; width: number; height: number }
  | { type: 'fixedWidth'; width: number };

export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface TextSpanStyle {
  fontFamily: string;
  fontWeight: FontWeight;
  fontStyle: 'normal' | 'italic';
  fontSize: number;
  color: Vec4;
  letterSpacing: number;
  lineHeight: number;
  strokeColor: Vec4;
  strokeWidth: number;
  underline: boolean;
  strikethrough: boolean;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface TextSpan {
  text: string;
  style: TextSpanStyle;
}

export interface TextContent {
  spans: TextSpan[];
}

export interface TextLayoutConfig {
  boundingBox: TextBoundingBox;
  horizontalAlign: TextAlign;
  verticalAlign: 'top' | 'middle' | 'bottom';
  overflow: 'visible' | 'clip' | 'truncate';
  baselineShift: number;
  perGlyphAnimation: boolean;
}

export interface TextAnimatableOverrides {
  fontSize: AnimatableProperty;
  letterSpacing: AnimatableProperty;
  lineHeight: AnimatableProperty;
  strokeWidth: AnimatableProperty;
}

// Shape geometry types
export interface RectangleShape {
  type: 'rectangle';
  width: AnimatableProperty;
  height: AnimatableProperty;
  fillColor: Vec4;
  strokeColor: Vec4;
  strokeWidth: AnimatableProperty;
  borderRadius: AnimatableProperty;
  /**
   * Optional independent per-corner radii, ordered [topLeft, topRight,
   * bottomRight, bottomLeft]. When present it overrides `borderRadius` (which
   * stays as the uniform fallback for legacy scenes and the single-value UI).
   */
  cornerRadii?: [AnimatableProperty, AnimatableProperty, AnimatableProperty, AnimatableProperty];
}

export interface CircleShape {
  type: 'circle';
  radius: AnimatableProperty;
  fillColor: Vec4;
  strokeColor: Vec4;
  strokeWidth: AnimatableProperty;
}

export interface StarShape {
  type: 'star';
  points: AnimatableProperty;
  outerRadius: AnimatableProperty;
  innerRadius: AnimatableProperty;
  fillColor: Vec4;
  strokeColor: Vec4;
  strokeWidth: AnimatableProperty;
}

export type VertexType = 'corner' | 'smooth' | 'bezier';

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';

export interface PathVertex {
  position: Vec2;
  handleIn: Vec2;
  handleOut: Vec2;
  vertexType: VertexType;
  /** How the two tangent handles relate when one is dragged (vector edit mode).
   *  Absent → derived from vertexType (corner=independent, else mirrored). */
  handleMode?: 'mirrored' | 'angle' | 'independent';
}

export interface PolygonShape {
  type: 'polygon';
  vertices: PathVertex[];
  closed: boolean;
  fillColor: Vec4;
  strokeColor: Vec4;
  strokeWidth: AnimatableProperty;
  lineCap?: LineCap;
  lineJoin?: LineJoin;
  /**
   * Optional inner sub-contours (M17 outlined text): the counters of glyphs like o/a/e/B.
   * Each is a closed `PathVertex[]` in the same local space as `vertices`; the tessellator
   * fills `vertices` minus `holes` (even-odd). Absent for ordinary single-contour shapes.
   */
  holes?: PathVertex[][];
  /** Fill rule when `holes` are present. Defaults to 'evenodd'. */
  fillRule?: 'evenodd' | 'nonzero';
}

export type ShapeGeometry = RectangleShape | CircleShape | StarShape | PolygonShape;

// ─── Material Fill System (multi-layer gradient) ───

export type MaterialGradientType = 'linear' | 'radial';

export type MaterialLinearDirection =
  | 'top-to-bottom' | 'bottom-to-top'
  | 'left-to-right' | 'right-to-left'
  | 'diagonal-tl-br' | 'diagonal-tr-bl';

export type MaterialRadialType =
  | 'center' | 'top-left' | 'top-right'
  | 'bottom-left' | 'bottom-right';

export type MaterialBlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion';

export interface MaterialColorStop {
  id: string;
  color: string;
  opacity: number;
  position: number;
}

export interface MaterialFillLayer {
  id: string;
  type: MaterialGradientType;
  colorStops: MaterialColorStop[];
  direction?: MaterialLinearDirection;
  radialType?: MaterialRadialType;
  angle?: number;
  blendMode: MaterialBlendMode;
  opacity: number;
}

export interface ShapeMaterialConfig {
  enabled: boolean;
  layers: MaterialFillLayer[];
}

// ─── Pattern Fill System ───

export type ShapePatternType = 'dots' | 'lines' | 'grid' | 'diagonal' | 'chevron' | 'custom';

export interface ShapePatternConfig {
  enabled: boolean;
  patternType: ShapePatternType;
  color: string;
  backgroundColor: string;
  size: number;
  spacing: number;
  angle: number;
  opacity: number;
  customSvg?: string;
}

// ─── Masking System ───
// A mask clips its owning layer's output via an analytic shape evaluated in the
// fragment shader (composition space). Multiple masks per layer are supported by
// the data model; v1 edits the first enabled mask.

export type MaskType = 'rectangle' | 'ellipse' | 'star' | 'polygon';

export interface Mask {
  id: string;
  name: string;
  type: MaskType;
  enabled: boolean;
  inverted: boolean;
  // Composition-space center.
  position: AnimatableProperty;
  // Full width/height (for star/polygon the .x component is the outer diameter).
  size: AnimatableProperty;
  rotation: AnimatableProperty;
  feather: AnimatableProperty;
  opacity: AnimatableProperty;
  points: number;
  innerRadius: AnimatableProperty;
}

export interface ResolvedMask {
  type: MaskType;
  centerX: number;
  centerY: number;
  sizeX: number;
  sizeY: number;
  rotation: number;
  feather: number;
  invert: boolean;
  opacity: number;
  points: number;
  innerRadius: number;
}

// A keyframeable 2.5D projected shadow. The shadow is rendered as a separate
// pass off the layer's isolated texture: its alpha is skewed/projected away
// from an anchor based on a virtual light, tinted, then blurred.
export interface LayerShadow {
  enabled: boolean;
  onlyShadow: boolean;
  color: Vec4;
  lightAngle: number;
  lightDistance: number;
  shadowScale: number;
  blurRadius: number;
}

export type GlowMode = 'image' | 'outer' | 'inner';

export interface LayerGlow {
  enabled: boolean;
  mode: GlowMode;
  onlyGlow: boolean;
  color: Vec4;
  intensity: number;
  radius: number;
  threshold: number;
  /** Which filter-panel "wire" filter (glow/bloom/softGlow/…) authored this, so
   * the panel can read its slider back unambiguously. Ignored by the renderer. */
  variant?: string;
}

export type BlurType = 'gaussian' | 'directional' | 'radial' | 'kawase';

export interface LayerBlur {
  enabled: boolean;
  type: BlurType;
  radius: number;
  angle: number;
  centerX: number;
  centerY: number;
  strength: number;
  passes: number;
  /** Which filter-panel "wire" filter (gaussianBlur/boxBlur/…) authored this, so
   * the panel can read its slider back unambiguously. Ignored by the renderer. */
  variant?: string;
}

export interface ShapeLayer {
  id: string;
  type: 'shape';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  shadow?: LayerShadow;
  glow?: LayerGlow;
  blur?: LayerBlur;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  masks?: Mask[];
  shape: ShapeGeometry;
  materialConfig?: ShapeMaterialConfig;
  strokeMaterialConfig?: ShapeMaterialConfig;
  patternFill?: ShapePatternConfig;
  /** M21 — linked color styles for fill/stroke (resolve reads through the style). */
  fillStyleId?: string;
  strokeStyleId?: string;
  inPoint: number;
  outPoint: number;
}

export interface TextLayer {
  id: string;
  type: 'text';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  shadow?: LayerShadow;
  glow?: LayerGlow;
  blur?: LayerBlur;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  masks?: Mask[];
  content: TextContent;
  layoutConfig: TextLayoutConfig;
  animOverrides: TextAnimatableOverrides;
  /** M21 — linked color styles for text fill/stroke. */
  fillStyleId?: string;
  strokeStyleId?: string;
  inPoint: number;
  outPoint: number;
}

export interface GroupLayer {
  id: string;
  type: 'group';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  collapsed: boolean;
  inPoint: number;
  outPoint: number;
}

export interface VideoLayer {
  id: string;
  type: 'video';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  shadow?: LayerShadow;
  glow?: LayerGlow;
  blur?: LayerBlur;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  masks?: Mask[];
  video: {
    assetId: string;
    sourceWidth: number;
    sourceHeight: number;
    sourceDuration: number;
    sourceFrameRate: number;
    startOffset: number;
    playbackRate: number;
    muted: boolean;
    playbackMode: VideoPlaybackMode;
    proxyScale: number;
    /** When set, the clip is frozen on this source frame for its whole duration. */
    freezeSourceFrame?: number;
    /** When true, the clip plays its frames in reverse over its comp range. */
    reversed?: boolean;
  };
  inPoint: number;
  outPoint: number;
}

// How a video clip's source frames are made available for playback:
//  - 'proxy'   : decode at a reduced resolution for smooth editing (export
//                still uses full resolution).
//  - 'upfront' : pre-decode the entire clip into a frame cache before editing.
//  - 'wait'    : decode on demand; playback holds rather than skipping frames.
export type VideoPlaybackMode = 'wait' | 'upfront' | 'proxy';

export interface ImageFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  gamma: number;
}

// One entry in an image layer's ordered effect stack. `type` is a frozen numeric
// id from the effect registry (core/effects/effectRegistry) that maps to a WGSL
// shader case; `params` are static scalars (up to 7) whose meaning the registry
// defines. This generic stack is how the catalog of image filters is rendered
// without a uniform field per filter.
export interface LayerEffect {
  type: number;
  enabled: boolean;
  params: number[];
}

export interface ColorWheelValues {
  r: number;
  g: number;
  b: number;
  intensity: number;
  luminance: number;
}

export interface ImageColorCorrection {
  lift: ColorWheelValues;
  gamma: ColorWheelValues;
  gain: ColorWheelValues;
  offset: ColorWheelValues;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  contrast: number;
  pivot: number;
}

export interface ImageLayer {
  id: string;
  type: 'image';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  shadow?: LayerShadow;
  glow?: LayerGlow;
  blur?: LayerBlur;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  masks?: Mask[];
  image: {
    assetId: string;
    sourceWidth: number;
    sourceHeight: number;
    format: string;
    fileSize: number;
  };
  filters: ImageFilters;
  colorCorrection: ImageColorCorrection;
  effects?: LayerEffect[];
  inPoint: number;
  outPoint: number;
}

export interface AudioLayer {
  id: string;
  type: 'audio';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  audio: {
    assetId: string;
    sourceDuration: number;
    sampleRate: number;
    channels: number;
    // Offset into the source, in composition frames. Source time 0 aligns with
    // (inPoint - startOffset). Mirrors VideoLayer.video.startOffset so audio
    // clips can be trimmed/split to play an arbitrary sub-region of their source.
    startOffset: number;
    muted: boolean;
    volume: AnimatableProperty;
    pitch: AnimatableProperty;
  };
  inPoint: number;
  outPoint: number;
}

export interface ParticleLayer {
  id: string;
  type: 'particle';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  particle: {
    preset: string;
    seed: number;
    emitterConfig: string;
  };
  inPoint: number;
  outPoint: number;
}

export interface AnimationItemLayer {
  id: string;
  type: 'animationItem';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  animationItem: {
    itemType: string;
    configJSON: string;
    dataSourceJSON: string;
  };
  inPoint: number;
  outPoint: number;
}

export interface FieldSampledLayer {
  id: string;
  type: 'fieldSampled';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  fieldSampled: {
    configJSON: string;
  };
  inPoint: number;
  outPoint: number;
}

// GPU-style procedural pattern generator (waves / plasma / kaleidoscope / mosaic). Config is an
// opaque JSON blob (src/patterns/); the layer rasterizes to a full-frame texture composited through
// the image pipeline (like fieldSampled). Frame-pure: the pattern is a function of localFrame only.
export interface GenerativePatternLayer {
  id: string;
  type: 'generativePattern';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  is3D?: boolean;
  shadow?: LayerShadow;
  glow?: LayerGlow;
  blur?: LayerBlur;
  blendMode: BlendMode;
  transform: Transform;
  // Bounded like a rectangle: the pattern is generated only inside width×height (movable via the
  // transform, resizable via the bounding box, maskable via `masks`).
  width: AnimatableProperty;
  height: AnimatableProperty;
  masks?: Mask[];
  // Keyframeable pattern knobs — override the static config values when animated (frequency, rotation,
  // domain-warp, contrast). Seeded from the config; the render reads these, not the config copies.
  patternAnim: {
    scale: AnimatableProperty;
    rotation: AnimatableProperty;
    warp: AnimatableProperty;
    contrast: AnimatableProperty;
  };
  generativePattern: {
    configJSON: string;
  };
  inPoint: number;
  outPoint: number;
}

export interface LottieIconLayer {
  id: string;
  type: 'lottieIcon';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  shadow?: LayerShadow;
  glow?: LayerGlow;
  blur?: LayerBlur;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  masks?: Mask[];
  lottieIcon: {
    jsonPath: string;
    jsonData: string;
    totalFrames: number;
    frameRate: number;
    sourceWidth: number;
    sourceHeight: number;
    startFrame: number;
    color: string;
  };
  inPoint: number;
  outPoint: number;
}

// ─── Layout Object Types ───

export type SizeValue =
  | { type: 'fixed'; value: number }
  | { type: 'wrapContent' }
  | { type: 'fillParent'; fraction?: number };

export type EdgeInsets = { top: number; right: number; bottom: number; left: number };

export type MainAxisAlignment = 'start' | 'end' | 'center' | 'spaceBetween' | 'spaceAround' | 'spaceEvenly';
export type CrossAxisAlignment = 'start' | 'end' | 'center' | 'stretch' | 'baseline';

export interface LayoutParams {
  width: SizeValue;
  height: SizeValue;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  spacing: number;
  padding: EdgeInsets;
  mainAxisAlignment: MainAxisAlignment;
  crossAxisAlignment: CrossAxisAlignment;
  overflowBehavior: 'clip' | 'visible' | 'scroll';
  background: string | null;
  borderRadius: number;
  borderColor: string | null;
  borderWidth: number;
  opacity: number;
  gridColumns?: number;
  gridHGap?: number;
  gridVGap?: number;
  gridHAlign?: 'start' | 'center' | 'end';
  gridVAlign?: 'start' | 'center' | 'end';
}

export interface ChildLayoutOverride {
  grow: number;
  shrink: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  alignSelf?: CrossAxisAlignment;
  margin: EdgeInsets;
  layoutVisibility: 'visible' | 'invisible' | 'gone';
}

export interface ComputedChildRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ComputedLayout {
  containerSize: { width: number; height: number };
  childRects: Record<string, ComputedChildRect>;
}

export interface LayoutObjectLayer {
  id: string;
  type: 'hbox' | 'vbox' | 'grid';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  children: string[];
  layoutParams: LayoutParams;
  childOverrides: Record<string, ChildLayoutOverride>;
  computedLayout: ComputedLayout | null;
  inPoint: number;
  outPoint: number;
}

// ─── Layout Container (spatial/path-based layout) ───

export type ContainerShapeType = 'rectangle' | 'circle' | 'customVector';
export type ContainerDistributionMode = 'border' | 'interior' | 'center' | 'vertices' | 'evenDistribution';

export interface ContainerShapeConfig {
  type: ContainerShapeType;
  width: number;
  height: number;
  radius: number;
  vertices: PathVertex[];
  closed: boolean;
}

export interface ContainerChildEntry {
  id: string;
  normalizedPosition: number;
}

export interface ContainerComputedData {
  pathLength: number;
  center: Vec2;
  bounds: { x: number; y: number; width: number; height: number };
  childPositions: Record<string, { x: number; y: number; angle: number }>;
}

export interface LayoutContainerLayer {
  id: string;
  type: 'layoutContainer';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  is3D?: boolean;
  blendMode: BlendMode;
  transform: Transform;
  containerShape: ContainerShapeConfig;
  distributionMode: ContainerDistributionMode;
  spacing: number;
  padding: number;
  rotationOffset: number;
  // When true, children distributed along the container's path/edge are
  // rotated to follow the local tangent (path-tangent orientation).
  followPathRotation?: boolean;
  children: ContainerChildEntry[];
  computedData: ContainerComputedData | null;
  inPoint: number;
  outPoint: number;
}

/** Optional time-remap of a precomp layer into its referenced sub-composition. */
export interface PrecompTimeRemap {
  /** Frame offset into the sub-composition at the precomp layer's inPoint. */
  startFrame: number;
  /** Playback speed multiplier (1 = realtime, 0 = frozen, negative = reverse). */
  timeStretch: number;
}

/**
 * A precomposition layer: references another Composition by id and renders it (a
 * nested RenderFrame, resolved recursively at a time-remapped local frame) as a
 * single layer in this composition. Mirrors the common Layer fields (there is no
 * shared BaseLayer interface in this codebase — each variant spells them out).
 */
// --- 2.5D Camera (M1) ---
// One-node = free camera aimed by its own orientation (transform rotationX/Y/Z); two-node =
// aims at a Point of Interest. `zoom` (px) drives the FOV. DOF params are carried + persisted
// now and consumed by the renderer in M5.
export type CameraMode = 'one-node' | 'two-node';

export type FilmSizeAxis = 'horizontal' | 'vertical' | 'diagonal';
export type CameraUnits = 'pixels' | 'inches' | 'millimeters';

export interface CameraSettings {
  mode: CameraMode;
  // Two-node aim target in composition space (x,y from `pointOfInterest`, z from `…Z`).
  pointOfInterest: AnimatableProperty; // vec2
  pointOfInterestZ: AnimatableProperty; // number
  // Lens: AE-style zoom in pixels — the SOLE render-affecting lens field (frame-pure).
  // Focal Length / Angle of View / F-Stop are DERIVED from (zoom, filmSize, comp size) in the
  // dialog + camera3d converters; storing them too would desync under keyframing. See camera3d.ts.
  zoom: AnimatableProperty; // number
  // Static lens paperwork (AE "Camera Settings"): affect only the derived-field DISPLAY, never
  // the render. Optional for back-compat — resolve/validation default them (36 / horizontal / …).
  filmSize?: number; // mm, default 36
  measureFilmSize?: FilmSizeAxis; // which comp dimension the film size maps to; default horizontal
  units?: CameraUnits; // display-only re-expression; default pixels
  // Depth of field.
  dofEnabled: boolean;
  focusDistance: AnimatableProperty; // number, px
  // When true, Focus Distance tracks Zoom (AE "Lock to Zoom") — resolved live, ignoring the
  // stored focusDistance. Default true. Undefined ⇒ off (safe for legacy cameras).
  lockToZoom?: boolean;
  aperture: AnimatableProperty; // number, px (F-Stop = zoom / aperture)
  blurLevel: AnimatableProperty; // number, fraction (1 = 100%)
}

// A camera is a first-class layer but resolves to View/Projection matrices, not a drawn quad.
// It carries a full Transform (position x/y + positionZ = eye; rotationX/Y/Z = one-node aim).
export interface CameraLayer {
  id: string;
  type: 'camera';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  transform: Transform;
  inPoint: number;
  outPoint: number;
  is3D?: boolean; // always true for a camera; kept for union-access parity
  effectsEnabled?: boolean;
  // Common effect fields so Layer-union member accesses type-check (a camera never draws, so
  // these are inert — it's skipped before the draw/effect path in resolveFrame).
  motionBlur?: boolean;
  motionBlurShutter?: number;
  shadow?: LayerShadow;
  glow?: LayerGlow;
  blur?: LayerBlur;
  masks?: Mask[];
  camera: CameraSettings;
}

export interface PrecompLayer {
  id: string;
  type: 'precomp';
  name: string;
  parentId: string | null;
  trackId: string | null;
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  transform: Transform;
  inPoint: number;
  outPoint: number;
  // Optional common-layer effect fields (so Layer-union accesses type-check).
  effectsEnabled?: boolean;
  motionBlur?: boolean;
  motionBlurShutter?: number;
  shadow?: LayerShadow;
  glow?: LayerGlow;
  blur?: LayerBlur;
  is3D?: boolean;
  masks?: Mask[];
  /** Registry key of the referenced sub-composition. */
  compositionId: string;
  timeRemap?: PrecompTimeRemap;
}

// Editor-only decorations common to every layer type. Kept as a shared
// intersection (rather than copied into all 14 interfaces) so a new field lands
// once; the distribution `X & (A | B)` = `(X & A) | (X & B)` preserves the
// discriminated-union narrowing on `type`.
export interface LayerDecorations {
  /** Optional timeline label tint (hex). Overrides the type color on clips. */
  labelColor?: string;
  /** M14 — per-layer reframe pin/scale constraints (top-level layers only). */
  constraints?: LayerConstraints;
}

export type Layer = (ShapeLayer | TextLayer | GroupLayer | VideoLayer | ImageLayer | AudioLayer | ParticleLayer | AnimationItemLayer | FieldSampledLayer | GenerativePatternLayer | LottieIconLayer | LayoutObjectLayer | LayoutContainerLayer | ClonerLayer | PrecompLayer | CameraLayer) & LayerDecorations;

// Track system
export type TrackType = 'video' | 'image' | 'text' | 'shape' | 'group' | 'audio' | 'particle' | 'animationItem' | 'fieldSampled' | 'generativePattern' | 'lottieIcon' | 'hbox' | 'vbox' | 'grid' | 'layoutContainer' | 'cloner' | 'precomp' | 'camera' | 'mixed';

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  order: number;
  locked: boolean;
  visible: boolean;
  muted?: boolean;
  // Solo: when ANY track in the composition is soloed, only soloed tracks
  // render (and are audible). Mirrors AE/Premiere solo. Transient-ish view
  // state, but persisted alongside visible/muted for consistency.
  solo?: boolean;
  // When enabled, clips on this track are laid out gaplessly in timeline
  // order (CapCut-style). Absolute positions become derived from clip order
  // and duration. Undefined falls back to the type default (video → on).
  compressed?: boolean;
  // User-created tracks set this so the empty-track pruner keeps them even
  // with no clips (a manually-added track shouldn't vanish on the next edit).
  keepIfEmpty?: boolean;
}

// Motion Path types
export type MotionPathAnchor = 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'custom';
export type MotionPathLoop = 'none' | 'loop' | 'pingPong';

export interface MotionPathNode {
  id: string;
  position: Vec2;
  handleIn: Vec2;
  handleOut: Vec2;
  vertexType: VertexType;
}

export interface MotionPath {
  id: string;
  layerId: string;
  nodes: MotionPathNode[];
  closed: boolean;
  anchor: MotionPathAnchor;
  customAnchor: Vec2;
  orientToPath: boolean;
  loop: MotionPathLoop;
  progress: AnimatableProperty;
}

export interface CompositionSettings {
  width: number;
  height: number;
  frameRate: number;
  /**
   * Live, content-driven duration. Always equals
   * `max(minimumDurationFrames, furthestClipEnd)`. Recomputed by the editor
   * store after any layer mutation; consumers (timeline, playback, export)
   * read this value and stay in sync automatically.
   */
  durationFrames: number;
  /**
   * User-configured minimum duration. The timeline can never become shorter
   * than this. Optional for legacy persisted compositions; absent values are
   * treated as `durationFrames` at load time.
   */
  minimumDurationFrames?: number;
  backgroundColor: Vec4;
}

export interface AnchorEdge {
  id: string;
  sourceLayerId: string;
  targetLayerId: string;
  enabled: boolean;
  mappings: AnchorPropertyMapping[];
  physics?: AnchorPhysicsConfig;
  temporal?: AnchorTemporalGate;
}

export type AnchorPropertyType =
  | 'positionX' | 'positionY'
  | 'rotation'
  | 'scaleX' | 'scaleY'
  | 'opacity';

export type AnchorTransferType = 'direct' | 'mirror' | 'scale' | 'remap' | 'expression';

export interface AnchorTransferFunction {
  type: AnchorTransferType;
  scale: number;
  offset: number;
  clampMin: number;
  clampMax: number;
}

export interface AnchorPropertyMapping {
  sourceProperty: AnchorPropertyType;
  targetProperty: AnchorPropertyType;
  transfer: AnchorTransferFunction;
}

export type AnchorPhysicsType = 'spring' | 'rope' | 'magnetic';

export interface AnchorPhysicsConfig {
  type: AnchorPhysicsType;
  spring?: { stiffness: number; damping: number; mass: number };
  rope?: { length: number; stiffness: number; gravity: number };
  magnetic?: { strength: number; falloff: number; maxDistance: number };
}

export type AnchorTemporalGateType = 'doWhile' | 'doAfter' | 'doFasterSlower' | 'doUntil';

export interface AnchorTemporalGate {
  type: AnchorTemporalGateType;
  triggerProperty?: AnchorPropertyType;
  threshold?: number;
  speedFactor?: number;
  delayFrames?: number;
}

/**
 * A timeline marker. A point marker (no `endFrame`) flags a single frame;
 * a section marker (`endFrame` set) spans a range. Rendered on the timeline
 * ruler; purely an editing aid (never affects render output).
 */
export interface Marker {
  id: string;
  frame: number;
  endFrame?: number;
  name?: string;
  /** Hex tint (e.g. '#f7b500'); falls back to a default when absent. */
  color?: string;
}

export interface Composition {
  id: string;
  name: string;
  settings: CompositionSettings;
  layers: Layer[];
  tracks: Track[];
  background: Background;
  motionPaths: MotionPath[];
  markers?: Marker[];
  proceduralBindings?: ProceduralBinding[];
  anchorEdges?: AnchorEdge[];
  physicsBindings?: PhysicsBindingDef[];
  physicsWorld?: PhysicsWorldDef;
  staggerBindings?: StaggerBindingDef[];
}

/**
 * The persisted multi-composition document: a registry of compositions (root +
 * precomps referenced by precomp/cloner layers) and which one is the root the
 * editor opens to. Legacy scenes serialized a bare `Composition`; those migrate to
 * a single-entry document (see serializeDocument/deserializeDocument).
 */
export interface SceneDocument {
  version: number;
  rootCompositionId: string;
  /** Ordered ids of the top-level scenes the user switches between. Optional for
   *  legacy documents (migrated to `[rootCompositionId]` on load). */
  scenes?: string[];
  compositions: Record<string, Composition>;
  /** M21 — document-level shared/linked style definitions (id → style), shared across comps. */
  styles?: Record<string, SharedStyle>;
}

export type StaggerDirectionMode =
  | 'layerStackOrder' | 'selectionClickOrder'
  | 'spatialLeftToRight' | 'spatialRightToLeft'
  | 'spatialTopToBottom' | 'spatialBottomToTop'
  | 'radialOutward' | 'radialInward'
  | 'gridSnake' | 'randomChaos';

export type StaggerCurveProfile = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'elasticSpring';
export type StaggerGroupExpansion = 'treatGroupsAsAtomicUnits' | 'expandIntoChildren' | 'expandRecursively';

export interface StaggerBindingDef {
  id: string;
  targetLayerIds: string[];
  directionMode: StaggerDirectionMode;
  invertOrder: boolean;
  gapFrames: number;
  totalDurationLock: { enabled: boolean; totalFrames: number };
  curveProfile: StaggerCurveProfile;
  curveIntensity: number;
  randomSeed: number;
  groupExpansion: StaggerGroupExpansion;
  liveReindexing: boolean;
  rowToleranceFraction: number;
  radialCenterMode: 'boundingBoxCenter' | 'masterLayer';
  radialMasterLayerId?: string;
}

export type PhysicsRoleDef = 'kinematic' | 'dynamic' | 'static' | 'ghost';
export type PhysicsColliderModeDef = 'boundingBox' | 'boundingCircle' | 'convexHull' | 'polyline';
export type PhysicsVelocitySourceDef = 'auto-derive' | 'manual';

export interface PhysicsMaterialDef {
  mass: number;
  restitution: number;
  friction: number;
  lockAxisX: boolean;
  lockAxisY: boolean;
  lockRotation: boolean;
  linearDamping: number;
  angularDamping: number;
}

export interface PhysicsColliderDef {
  mode: PhysicsColliderModeDef;
  manualPoints?: [number, number][];
  radiusOverride?: number;
  widthOverride?: number;
  heightOverride?: number;
}

export interface PhysicsHandoffDef {
  velocitySource: PhysicsVelocitySourceDef;
  manualMagnitude: number;
  manualAngleDeg: number;
  deriveSampleWindow: number;
}

export interface PhysicsBindingDef {
  id: string;
  layerId: string;
  enabled: boolean;
  role: PhysicsRoleDef;
  material: PhysicsMaterialDef;
  collider: PhysicsColliderDef;
  birthFrame: number;
  endFrame?: number;
  handoff: PhysicsHandoffDef;
  solidBeforeActivation: boolean;
}

export interface PhysicsWorldDef {
  enabled: boolean;
  gravityX: number;
  gravityY: number;
  timeScale: number;
  substeps: number;
}

export interface ProceduralBinding {
  id: string;
  layerId: string;
  enabled: boolean;
  loopType: 'transform' | 'gridArray' | 'tileScroll';
  loopDurationFrames: number;
  speedMultiplier: number;
  pingPong: boolean;
  transformParams?: ProceduralTransformParam[];
  gridParams?: ProceduralGridParams;
  tileParams?: ProceduralTileParams;
}

export interface ProceduralTransformParam {
  property: 'rotation' | 'scaleX' | 'scaleY' | 'scale' | 'positionX' | 'positionY' | 'opacity';
  cycles: number;
  amplitude: number;
  offset: number;
  easing: 'linear' | 'sine' | 'cosine';
  direction: 1 | -1;
}

export interface ProceduralGridParams {
  rows: number;
  cols: number;
  cellWidth: number;
  cellHeight: number;
  spacingX: number;
  spacingY: number;
  phaseOffsetMode: 'diagonal' | 'radial' | 'horizontal' | 'vertical' | 'random';
  phaseSpread: number;
  baseTransforms: ProceduralTransformParam[];
}

export interface ProceduralTileParams {
  scrollX: number;
  scrollY: number;
  tileWidth: number;
  tileHeight: number;
}

export interface ResolvedTransform {
  positionX: number;
  positionY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  anchorX: number;
  anchorY: number;
  opacity: number;
  // --- 2.5D: resolved depth + out-of-plane rotations (degrees). Default 0, so a 2D layer's
  // resolved transform is numerically identical to before. is3D gates whether these are used. ---
  positionZ: number;
  rotationX: number;
  rotationY: number;
}

export type ShapeRenderType = 'rectangle' | 'circle' | 'star' | 'polygon';

// A gradient/solid fill resolved to plain numbers ready for GPU packing.
// One `ResolvedFill` describes either a solid color (kind = 0) or a stack of
// gradient layers (kind = 1) composited with blend modes, mirroring the
// multi-layer ShapeMaterialConfig / the DOM preview.
export interface ResolvedFillStop {
  // rgb + alpha, alpha already folded with the layer's opacity, all in 0..1.
  color: Vec4;
  // 0..1 along the gradient.
  position: number;
}

export interface ResolvedFillLayer {
  gradientType: number; // 0 linear, 1 radial
  angle: number;        // radians, CSS convention (0 = toward top)
  centerX: number;      // 0..1 in the shape box (radial)
  centerY: number;      // 0..1 in the shape box (radial)
  blendMode: number;    // MaterialBlendMode index, 0..11
  stops: ResolvedFillStop[];
}

export interface ResolvedFill {
  kind: number;  // 0 solid, 1 gradient
  color: Vec4;   // solid color / fallback when kind = 0
  layers: ResolvedFillLayer[];
}

// A pattern fill resolved for the GPU. Built-in patterns are drawn analytically
// in the shader; custom-SVG patterns can't be shaderized and resolve to
// `enabled: false`.
export interface ResolvedPattern {
  enabled: boolean;
  patternType: number;   // 0 dots, 1 lines, 2 grid, 3 diagonal, 4 chevron
  color: Vec4;           // mark color (rgb; alpha unused, coverage-driven)
  hasBackground: boolean;
  backgroundColor: Vec4; // tile background (rgb) when hasBackground
  size: number;          // mark size in px (dot diameter / stroke width)
  spacing: number;       // gap between tiles in px
  angle: number;         // radians
  opacity: number;       // 0..1
}

export interface ResolvedShape {
  renderType: ShapeRenderType;
  width: number;
  height: number;
  fillColor: Vec4;
  strokeColor: Vec4;
  // Full gradient/solid descriptors for GPU rendering. `fillColor`/`strokeColor`
  // remain as flat fallbacks (dominant color) for consumers that don't render
  // gradients (polygon path pipeline, thumbnails).
  fill?: ResolvedFill;
  stroke?: ResolvedFill;
  pattern?: ResolvedPattern;
  strokeWidth: number;
  borderRadius: number;
  /** Resolved per-corner radii [tl, tr, br, bl] when the rectangle uses
   *  independent corners; absent means the uniform `borderRadius` applies. */
  cornerRadii?: [number, number, number, number];
  // Circle
  radius: number;
  // Star
  points: number;
  outerRadius: number;
  innerRadius: number;
  // Polygon
  vertices: PathVertex[];
  closed: boolean;
  lineCap: LineCap;
  lineJoin: LineJoin;
  /** Glyph counters / inner contours (M17 outlined text) — filled as holes. */
  holes?: PathVertex[][];
}

export interface ResolvedText {
  content: string;
  mode: TextMode;
  boxWidth: number;
  boxHeight: number;
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fillColor: Vec4;
  strokeColor: Vec4;
  strokeWidth: number;
  textAlign: TextAlign;
  underline: boolean;
  strikethrough: boolean;
  measuredWidth: number;
  measuredHeight: number;
}

export interface ResolvedVideo {
  assetId: string;
  sourceFrame: number;
  sourceWidth: number;
  sourceHeight: number;
  playbackRate: number;
  playbackMode: VideoPlaybackMode;
  proxyScale: number;
}

// A resolved image effect: the frozen numeric type + its static params, ready
// to pack into the shader's effect-slot array.
export interface ResolvedEffect {
  type: number;
  params: number[];
}

export interface ResolvedImage {
  assetId: string;
  sourceWidth: number;
  sourceHeight: number;
  filters: ImageFilters;
  colorCorrection: ImageColorCorrection;
  effects: ResolvedEffect[];
}

// Per-pixel velocity field for analytic motion blur, derived from the layer's
// frame-to-frame motion (linear + rotational + scale). The renderer turns this
// into directional samples in a GPU shader. All values are in composition space;
// vx/vy/omega are per-frame deltas, scaleRate is fractional per-frame.
export interface ResolvedMotionBlur {
  shutter: number;
  pivotX: number;
  pivotY: number;
  vx: number;
  vy: number;
  omega: number;
  scaleRateX: number;
  scaleRateY: number;
}

// A resolved 2.5D shadow for one layer at one frame. The shadow is projected
// away from (pivotX, pivotY) in composition space: each pixel is offset by the
// light direction scaled by lightDistance, sheared so the cast stretches with
// distance from the anchor, uniformly scaled by shadowScale, then Gaussian
// blurred by blurRadius (composition px) and tinted by color.
export interface ResolvedShadow {
  color: Vec4;
  lightAngle: number;
  lightDistance: number;
  shadowScale: number;
  blurRadius: number;
  onlyShadow: boolean;
  pivotX: number;
  pivotY: number;
}

export interface ResolvedGlow {
  mode: GlowMode;
  onlyGlow: boolean;
  color: Vec4;
  intensity: number;
  radius: number;
  threshold: number;
}

export interface ResolvedBlur {
  type: BlurType;
  radius: number;
  angle: number;
  centerX: number;
  centerY: number;
  strength: number;
  passes: number;
}

export interface ResolvedParticle {
  emitterConfigJSON: string;
  seed: number;
  localFrame: number;
}

export interface ResolvedProceduralLoop {
  kind: 'transform' | 'gridArray' | 'tileScroll';
  transform?: { x: number; y: number; rotation: number; scaleX: number; scaleY: number; opacity: number };
  grid?: {
    instances: { x: number; y: number; rotation: number; scaleX: number; scaleY: number; opacity: number }[];
    gridCols: number; gridRows: number; cellWidth: number; cellHeight: number;
  };
  tile?: { offsetU: number; offsetV: number; tileWidth: number; tileHeight: number };
}

export interface ResolvedFieldSampled {
  configJSON: string;
  localFrame: number;
}

export interface ResolvedGenerativePattern {
  configJSON: string;
  localFrame: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  warp: number;
  contrast: number;
}

export interface ResolvedLottieIcon {
  jsonPath: string;
  jsonData: string;
  totalFrames: number;
  frameRate: number;
  sourceWidth: number;
  sourceHeight: number;
  localFrame: number;
  color: string;
}

/**
 * A resolved cloner: the render path (chosen from the source's type) plus the
 * per-instance transforms already computed, capped, and composed (distribution +
 * effectors + staggered source animation). `sourceLayerId` lets the renderer fetch
 * the source's geometry (instanced-shape) or render it once to a texture (stamp).
 */
export interface ResolvedCloner {
  renderPath: ClonerRenderPath;
  sourceLayerId: string | null;
  instances: InstanceTransform[];
  /** Content-overridden source layers, one per instance (data-bound source): the
   *  instance-override mechanism (core/overrides) applied to the source. Present
   *  only on the `per-instance` render path; instanceSources[i] ↔ instances[i]. */
  instanceSources?: Layer[];
}

export interface ResolvedLayer {
  id: string;
  visible: boolean;
  blendMode: BlendMode;
  transform: ResolvedTransform;
  shape?: ResolvedShape;
  text?: ResolvedText;
  video?: ResolvedVideo;
  image?: ResolvedImage;
  particle?: ResolvedParticle;
  fieldSampled?: ResolvedFieldSampled;
  generativePattern?: ResolvedGenerativePattern;
  lottieIcon?: ResolvedLottieIcon;
  proceduralLoop?: ResolvedProceduralLoop;
  mask?: ResolvedMask;
  masks?: ResolvedMask[];
  motionBlur?: ResolvedMotionBlur;
  shadow?: ResolvedShadow;
  glow?: ResolvedGlow;
  blur?: ResolvedBlur;
  cloner?: ResolvedCloner;
  precomp?: ResolvedPrecomp;
  // 2.5D (M1): world model matrix for 3D layers (`is3D`), for the M2 MVP path. Absent on 2D
  // layers, which keep the cheap affine transform above.
  worldMatrix?: Mat4;
  // 2.5D (M2): true when the source layer's 3D switch is on — the renderer projects it through
  // the frame camera (MVP) and depth-sorts it. Absent/false → the untouched 2D path.
  is3D?: boolean;
  layerType: 'shape' | 'text' | 'video' | 'image' | 'audio' | 'particle' | 'fieldSampled' | 'generativePattern' | 'lottieIcon' | 'cloner' | 'precomp';
}

export interface RenderFrame {
  frameNumber: number;
  totalFrames: number;
  /** Composition frame rate — used by time-based CPU renderers (e.g. field sampling). */
  frameRate?: number;
  width: number;
  height: number;
  backgroundColor: Vec4;
  background: Background;
  layers: ResolvedLayer[];
  // 2.5D (M1): the active camera resolved to View/Projection for this frame (the topmost
  // enabled camera layer, else a default camera framing the comp 1:1). The renderer consumes
  // it in M2; present on every frame so 3D layers always have a camera.
  camera?: ResolvedCamera;
}

/**
 * A resolved precomp: the referenced sub-composition already recursively resolved
 * into its own RenderFrame (at the time-remapped local frame), for the renderer to
 * render offscreen and composite under the precomp layer's transform/opacity/blend.
 * `renderFrame` is null when the reference is missing or a cycle/depth-cap was hit
 * (renders nothing — safe). width/height are the sub-composition's resolution.
 */
export interface ResolvedPrecomp {
  compositionId: string;
  renderFrame: RenderFrame | null;
  width: number;
  height: number;
}
