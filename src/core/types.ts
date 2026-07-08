export type Vec2 = [number, number];
export type Vec4 = [number, number, number, number];

export type InterpolationType = 'linear' | 'bezier' | 'hold' | 'spring';

export interface Keyframe {
  frame: number;
  value: number | Vec2;
  interpolation: InterpolationType;
  handleIn: Vec2;
  handleOut: Vec2;
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
  children: ContainerChildEntry[];
  computedData: ContainerComputedData | null;
  inPoint: number;
  outPoint: number;
}

export type Layer = ShapeLayer | TextLayer | GroupLayer | VideoLayer | ImageLayer | AudioLayer | ParticleLayer | AnimationItemLayer | FieldSampledLayer | LottieIconLayer | LayoutObjectLayer | LayoutContainerLayer;

// Track system
export type TrackType = 'video' | 'image' | 'text' | 'shape' | 'group' | 'audio' | 'particle' | 'animationItem' | 'fieldSampled' | 'lottieIcon' | 'hbox' | 'vbox' | 'grid' | 'layoutContainer' | 'mixed';

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  order: number;
  locked: boolean;
  visible: boolean;
  muted?: boolean;
  // When enabled, clips on this track are laid out gaplessly in timeline
  // order (CapCut-style). Absolute positions become derived from clip order
  // and duration. Undefined falls back to the type default (video → on).
  compressed?: boolean;
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

export interface Composition {
  id: string;
  name: string;
  settings: CompositionSettings;
  layers: Layer[];
  tracks: Track[];
  background: Background;
  motionPaths: MotionPath[];
  proceduralBindings?: ProceduralBinding[];
  anchorEdges?: AnchorEdge[];
  physicsBindings?: PhysicsBindingDef[];
  physicsWorld?: PhysicsWorldDef;
  staggerBindings?: StaggerBindingDef[];
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
}

export type ShapeRenderType = 'rectangle' | 'circle' | 'star' | 'polygon';

export interface ResolvedShape {
  renderType: ShapeRenderType;
  width: number;
  height: number;
  fillColor: Vec4;
  strokeColor: Vec4;
  strokeWidth: number;
  borderRadius: number;
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

export interface ResolvedImage {
  assetId: string;
  sourceWidth: number;
  sourceHeight: number;
  filters: ImageFilters;
  colorCorrection: ImageColorCorrection;
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
  lottieIcon?: ResolvedLottieIcon;
  proceduralLoop?: ResolvedProceduralLoop;
  mask?: ResolvedMask;
  masks?: ResolvedMask[];
  motionBlur?: ResolvedMotionBlur;
  shadow?: ResolvedShadow;
  glow?: ResolvedGlow;
  blur?: ResolvedBlur;
  layerType: 'shape' | 'text' | 'video' | 'image' | 'audio' | 'particle' | 'fieldSampled' | 'lottieIcon';
}

export interface RenderFrame {
  frameNumber: number;
  totalFrames: number;
  width: number;
  height: number;
  backgroundColor: Vec4;
  background: Background;
  layers: ResolvedLayer[];
}
