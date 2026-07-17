import type { EasingType } from '../animation-engine/types';

export interface DesignElement {
  id: string;
  type: 'rectangle' | 'circle' | 'text' | 'button' | 'chat-bubble' | 'chat-frame' | 'input' | 'toggle' | 'modal' | 'progress' | 'group' | 'line' | 'image' | 'video' | 'star' | 'gradient' | 'adjustment-layer' | 'svg' | 'hbox' | 'vbox';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  
  // Style properties
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  shadow: {
    blur: number;
    color: string;
    x: number;
    y: number;
  };
  innerShadow?: {
    enabled: boolean;
    blur: number;
    color: string;
    x: number;
    y: number;
    borders: {
      top: boolean;
      right: boolean;
      bottom: boolean;
      left: boolean;
    };
  };

  // Material properties (single material per shape) - DEPRECATED
  material?: import('./material').Material;

  // New multi-layer material system
  materialConfig?: import('./material').ShapeMaterialConfig;

  // Stroke multi-layer material system
  strokeMaterialConfig?: import('./material').ShapeMaterialConfig;

  // Text properties (for text elements)
  text?: string;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  fontStyle?: 'normal' | 'italic' | 'oblique';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'small-caps';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  textColor?: string;
  letterSpacing?: number;
  lineHeight?: number;
  wordSpacing?: number;
  textDecoration?: 'none' | 'underline' | 'line-through' | 'overline';

  // Advanced text effects
  textStrokeColor?: string;
  textStrokeWidth?: number;
  textShadowBlur?: number;
  textShadowOffsetX?: number;
  textShadowOffsetY?: number;
  textShadowColor?: string;

  // Text gradient fill
  textGradientEnabled?: boolean;
  textGradientType?: 'linear' | 'radial';
  textGradientColors?: Array<{ color: string; position: number; id: string }>;
  textGradientAngle?: number;

  // Text glow effect
  textGlowColor?: string;
  textGlowSize?: number;
  textGlowIntensity?: number;

  // Texture fill for text
  textTextureFillEnabled?: boolean;
  textTextureFillImage?: string;
  textTextureFillScale?: number;
  textTextureFillOffsetX?: number;
  textTextureFillOffsetY?: number;

  // Pattern fill for text
  textPatternFillEnabled?: boolean;
  textPatternType?: 'dots' | 'lines' | 'grid' | 'diagonal' | 'chevron' | 'custom';
  textPatternColor?: string;
  textPatternBackgroundColor?: string;
  textPatternSize?: number;
  textPatternSpacing?: number;
  textPatternAngle?: number;
  textPatternCustomSvg?: string;

  // Pattern fill for shapes
  shapePatternFillEnabled?: boolean;
  shapePatternType?: 'dots' | 'lines' | 'grid' | 'diagonal' | 'chevron' | 'custom';
  shapePatternColor?: string;
  shapePatternBackgroundColor?: string;
  shapePatternSize?: number;
  shapePatternSpacing?: number;
  shapePatternAngle?: number;
  shapePatternCustomSvg?: string;
  shapePatternOpacity?: number;

  // Rich text support
  richTextEnabled?: boolean;
  richTextSegments?: Array<{
    id: string;
    text: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: 'normal' | 'italic' | 'oblique';
    color?: string;
    textDecoration?: 'none' | 'underline' | 'line-through' | 'overline';
    letterSpacing?: number;
  }>;

  // Text baseline and spacing
  baselineShift?: number;
  textIndent?: number;

  // Text wrapping and overflow
  textWrap?: 'wrap' | 'nowrap' | 'balance';
  textOverflow?: 'clip' | 'ellipsis' | 'visible';
  maxLines?: number;

  // Text padding within element
  textPaddingTop?: number;
  textPaddingRight?: number;
  textPaddingBottom?: number;
  textPaddingLeft?: number;

  // Text animation control (legacy — use animationTargetLevel + stagger for new features)
  textAnimationMode?: 'whole' | 'line' | 'word' | 'character';
  textAnimationStaggerDelay?: number; // Gap time in seconds between animated units

  // Text animation topology — these fields define how the animation engine targets text.
  // They are inert until the animation system uses them; they never affect rendering on
  // their own. Every new text element is initialised with the defaults shown below.

  /**
   * Controls which level of the text hierarchy the animation engine targets.
   * "object" = whole element as one unit (default, zero overhead).
   * "line" / "word" / "char" = per-segment animation targeting.
   * Default: "object"
   */
  animationTargetLevel?: 'object' | 'line' | 'word' | 'char';

  /**
   * Stagger delay in seconds between successive animated text segments.
   * Used by the animation engine to offset segment clip start times.
   * Default: 0
   */
  stagger?: number;

  /**
   * Sequence order in which segments receive their staggered animations.
   * "forward" = first-to-last, "reverse" = last-to-first, "random" = shuffled.
   * Default: "forward"
   */
  order?: 'forward' | 'reverse' | 'random';

  /**
   * When true each text segment is clipped to its own bounding box, enabling
   * text-reveal animation patterns where characters slide in from outside their bounds.
   * Default: false
   */
  masking?: boolean;

  // Line properties (for line elements)
  lineType?: 'line' | 'arrow' | 'pen';
  points?: Array<{ x: number; y: number; smooth?: boolean; radius?: number }>;
  cornerRadius?: number; // Global corner radius for line connections
  pointCornerRadii?: number[]; // Per-point corner radius values
  arrowStart?: boolean;
  arrowEnd?: boolean;
  arrowheadType?: 'triangle' | 'circle' | 'bar' | 'diamond';
  arrowheadSize?: number;
  lineCap?: 'round' | 'butt' | 'square';
  lineJoin?: 'round' | 'bevel' | 'miter';
  dashArray?: number[];
  dashIntensity?: number;
  smoothing?: number;
  trimStart?: number;
  trimEnd?: number;
  closePath?: boolean;
  autoScaleArrows?: boolean;
  
  // UI-specific properties
  variant?: string;
  isActive?: boolean;
  progress?: number;
  
  // Group properties
  children?: DesignElement[];
  parentId?: string;

  // Image properties (for image elements)
  imageData?: string; // base64 or blob URL
  originalWidth?: number;
  originalHeight?: number;
  aspectRatioLocked?: boolean;
  mirrorH?: boolean;
  mirrorV?: boolean;
  filters?: ImageFilters;
  blendMode?: BlendMode;
  cropData?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Video properties (for video elements)
  /** ID of the VideoClip in VideoContext that this element controls */
  videoClipId?: string;
  /** ID of the VideoAsset in VideoContext for this element */
  videoAssetId?: string;

  // Star properties (for star elements)
  starPoints?: number; // Number of points in the star (default: 5)
  starInnerRadius?: number; // Inner radius as percentage of outer radius (0-100, default: 50)

  // Gradient properties (for gradient elements)
  gradientEnabled?: boolean;
  gradientType?: 'linear' | 'radial' | 'conic';
  gradientAngle?: number; // For linear gradients (0-360 degrees)
  gradientColors?: Array<{ color: string; position: number; id: string }>;
  gradientCenterX?: number; // For radial gradients (0-100%)
  gradientCenterY?: number; // For radial gradients (0-100%)

  // Adjustment layer properties (for adjustment-layer elements)
  adjustmentType?: 'color' | 'brightness-contrast' | 'hue-saturation' | 'levels' | 'curves';
  adjustmentIntensity?: number; // 0-100

  // SVG properties (for svg elements)
  svgData?: string; // Raw SVG content
  svgViewBox?: string; // ViewBox attribute
  svgPreserveAspectRatio?: string;
  svgFillColor?: string; // Override fill color
  svgStrokeColor?: string; // Override stroke color

  // HBox / VBox layout container properties (direct fields — no nesting)
  padding?: number;
  margin?: number;
  childIds?: string[];

  // Clipping mask properties
  masks?: ClipMask[];
  shadowMasks?: ClipMask[];
  shadowMaskEnabled?: boolean;
  shadowMaskTarget?: 'outer' | 'inner' | 'both';

  // TextAnimator layers — additive procedural animation on top of the base keyframe system.
  // Serialised to project files. Empty/absent = no animator behaviour.
  animatorLayers?: TextAnimatorLayer[];
}

// ─── Text Animation Types ─────────────────────────────────────────────────────
// These types define the structured text model used by the animation system.
// They do not change any existing rendering or UI behaviour on their own.

/**
 * All text styling properties bundled into one object.
 * Used as baseStyle on TextObject and as Partial overrides on TextSegment.
 */
export interface TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: 'normal' | 'italic' | 'oblique';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /** Text fill colour. Maps to DesignElement.textColor */
  color?: string;
  letterSpacing?: number;
  lineHeight?: number;
  wordSpacing?: number;
  textDecoration?: 'none' | 'underline' | 'line-through' | 'overline';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'small-caps';
}

/**
 * Static spatial placement and layout properties for a text element.
 * All fields mirror their counterparts on DesignElement — they are NOT
 * duplicated in storage; this type is only used when constructing a TextObject
 * for the animation system.
 */
export interface TextLayout {
  /** Canvas x position of the element origin. Mirrors DesignElement.x */
  x: number;
  /** Canvas y position of the element origin. Mirrors DesignElement.y */
  y: number;
  /** Element bounding-box width. Mirrors DesignElement.width */
  width: number;
  /** Element bounding-box height. Mirrors DesignElement.height */
  height: number;
  /** Horizontal text alignment. Mirrors DesignElement.textAlign. Default: "left" */
  alignment: 'left' | 'center' | 'right' | 'justify';
  /** Line height multiplier. Mirrors DesignElement.lineHeight. Default: 1.5 */
  lineHeight: number;
  /** Letter spacing in px. Mirrors DesignElement.letterSpacing. Default: 0 */
  letterSpacing: number;
  /** Text wrapping behaviour. Mirrors DesignElement.textWrap. Default: "wrap" */
  wrappingMode: 'wrap' | 'nowrap' | 'balance';
}

/**
 * Per-element or per-segment transform used by the animation system.
 * When all fields equal their identity defaults the visual output is
 * identical to applying no transform at all — safe to add to any element.
 */
export interface TransformProps {
  /** Positional offset in px relative to the layout position. Default: {x:0, y:0} */
  position: { x: number; y: number };
  /** Scale multiplier per axis. Default: {x:1, y:1} */
  scale: { x: number; y: number };
  /** Rotation in degrees around the anchorPoint. Default: 0 */
  rotation: number;
  /** Opacity multiplier 0–1 applied on top of the element's base opacity. Default: 1 */
  opacity: number;
  /** Skew in degrees per axis. Default: {x:0, y:0} */
  skew: { x: number; y: number };
  /**
   * Normalised anchor point for transform operations (0–1 per axis, relative to
   * the segment/element bounding box). Default: {x:0.5, y:0.5} (centre)
   */
  anchorPoint: { x: number; y: number };
}

/** Creates a new identity TransformProps object. Applying it produces no visual change. */
export function createIdentityTransform(): TransformProps {
  return {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
    skew: { x: 0, y: 0 },
    anchorPoint: { x: 0.5, y: 0.5 },
  };
}

/**
 * A single node in the text segment hierarchy produced by buildTextSegments().
 * Segments are derived deterministically from the element's text content —
 * they are NEVER serialised to disk and are always re-derived on load.
 */
export interface TextSegment {
  /**
   * Stable deterministic ID derived from hierarchy position.
   * Format: "line-{li}" | "word-{li}-{wi}" | "char-{li}-{wi}-{ci}"
   */
  id: string;
  /** Hierarchy level of this segment */
  type: 'line' | 'word' | 'char';
  /** ID of the parent segment, or null for top-level line segments */
  parentId: string | null;
  /** String content of this segment */
  text: string;
  /** Zero-based position of this segment within its parent collection */
  index: number;
  /**
   * Style overrides applied on top of TextObject.baseStyle.
   * Empty by default — only populated when individual segment styling is needed.
   */
  style: Partial<TextStyle>;
  /**
   * Per-segment transform for animation.
   * Defaults to identity — no visual effect until the animation system writes to it.
   */
  transform: TransformProps;
  /** Visibility multiplier 0–1 used for reveal/hide animation effects. Default: 1 */
  visibility: number;
  /** Precomputed x offset from the element's top-left corner in px */
  layoutX: number;
  /** Precomputed y offset from the element's top-left corner in px */
  layoutY: number;
  /** Precomputed rendered width of this segment in px */
  layoutWidth: number;
  /** Precomputed rendered height (line height) of this segment in px */
  layoutHeight: number;
}

/**
 * Structured text object that wraps all text state for the animation system.
 * This is a VIEW over the flat DesignElement fields — it is constructed lazily
 * by the animation system and never stored as a separate entity.
 *
 * All existing code continues to read properties directly from DesignElement.
 * This type is used only when the animation engine needs a structured view.
 */
export interface TextObject {
  /** Unique ID — always matches the parent DesignElement.id */
  id: string;
  /**
   * Full raw text string — source of truth for what the user typed.
   * Mirrors DesignElement.text.
   */
  content: string;
  /** Static spatial placement properties derived from the element's layout fields */
  layout: TextLayout;
  /**
   * Pre-built segment hierarchy.
   * Empty by default — populated lazily when animation mode requires segmentation.
   */
  segments: TextSegment[];
  /**
   * Animation targeting mode for text hierarchy.
   * "block" = entire element as one unit (default, identical to pre-refactor behaviour).
   * "line" / "word" / "char" = per-segment targeting.
   * Default: "block"
   */
  animationMode: 'block' | 'line' | 'word' | 'char';
  /** Base styling applied to all text. Per-segment style overrides layer on top. */
  baseStyle: TextStyle;
  /** Base transform of the entire text element. Identity by default. */
  transform: TransformProps;
  /**
   * Non-serialised segment cache. Populated by buildTextSegments().
   * Invalidated (set to null) whenever DesignElement.text changes.
   * NOT persisted to project files — always re-derived from content on load.
   */
  _segmentCache?: TextSegment[] | null;
}

/**
 * Constructs a TextObject from a DesignElement, mapping all existing flat fields
 * onto the structured TextObject shape. Does not duplicate storage — the result
 * is a computed view used only by the animation system.
 */
export function designElementToTextObject(el: DesignElement): TextObject {
  return {
    id: el.id,
    content: el.text || '',
    layout: {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      alignment: (el.textAlign as TextLayout['alignment']) || 'left',
      lineHeight: el.lineHeight ?? 1.5,
      letterSpacing: el.letterSpacing ?? 0,
      wrappingMode: (el.textWrap as TextLayout['wrappingMode']) || 'wrap',
    },
    segments: [],
    animationMode: el.animationTargetLevel === 'line' ? 'line'
      : el.animationTargetLevel === 'word' ? 'word'
      : el.animationTargetLevel === 'char' ? 'char'
      : 'block',
    baseStyle: {
      fontFamily: el.fontFamily,
      fontSize: el.fontSize,
      fontWeight: el.fontWeight,
      fontStyle: el.fontStyle,
      textAlign: el.textAlign,
      verticalAlign: el.verticalAlign,
      color: el.textColor,
      letterSpacing: el.letterSpacing,
      lineHeight: el.lineHeight,
      wordSpacing: el.wordSpacing,
      textDecoration: el.textDecoration,
      textTransform: el.textTransform,
    },
    transform: createIdentityTransform(),
    _segmentCache: null,
  };
}

/**
 * A single procedural animation layer attached to a text element.
 * Multiple layers stack additively on top of the base keyframe system.
 * Stored as `animatorLayers` on DesignElement and serialised to project files.
 */
export interface TextAnimatorLayer {
  id: string;
  /** Which level of the text hierarchy this layer targets */
  targetType: 'characters' | 'words' | 'lines';
  /** Which visual primitive this layer drives */
  property: 'opacity' | 'position' | 'scale' | 'rotation' | 'skew' | 'blur' | 'maskWidth' | 'maskHeight';
  /** Full value at progress=0 (before resolving to base). Opacity 0–1, position px, scale multiplier, rotation deg, blur px, mask 0–1 */
  amount: number;
  /** Axis — relevant for position, scale, skew */
  axis?: 'x' | 'y';
  /** When the animation begins in timeline seconds */
  startTime: number;
  /** Duration in seconds for each segment to animate from amount → resolved */
  duration: number;
  /** Time offset between successive segments in seconds */
  stagger: number;
  /** Easing function reusing the keyframe engine identifiers */
  easing: EasingType;
  /** Order in which segments receive their stagger offset */
  direction: 'forward' | 'reverse' | 'center' | 'random';
}

export interface ClipMask {
  id: string;
  name: string;
  type: 'rectangle' | 'circle' | 'star' | 'line';
  enabled: boolean;
  inverted: boolean;
  feather: number;
  expand: number;
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  borderRadius: number;
  starPoints?: number;
  starInnerRadius?: number;
  linked: boolean;
  lineAngle?: number;
  lineOffset?: number;
  lineSide?: 'above' | 'below';
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export interface ImageFilters {
  // Basic Adjustments
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  exposure: number; // -100 to 100
  gamma: number; // 0.1 to 3.0 (default 1.0)
  temperature: number; // -100 to 100
  tint: number; // -100 to 100
  vibrance: number; // -100 to 100
  saturation: number; // -100 to 100

  // HSL Adjustments
  hue: number; // -180 to 180
  lightness: number; // -100 to 100
  grayscale: number; // 0 to 100
  invert: boolean;
  sepia: number; // 0 to 100

  // Color Balance
  shadowsRed: number; // -100 to 100
  shadowsGreen: number; // -100 to 100
  shadowsBlue: number; // -100 to 100
  midtonesRed: number; // -100 to 100
  midtonesGreen: number; // -100 to 100
  midtonesBlue: number; // -100 to 100
  highlightsRed: number; // -100 to 100
  highlightsGreen: number; // -100 to 100
  highlightsBlue: number; // -100 to 100

  // Levels
  levelsBlackPoint: number; // 0 to 255
  levelsMidPoint: number; // 0.1 to 9.99 (default 1.0)
  levelsWhitePoint: number; // 0 to 255

  // RGB Channels
  redChannel: number; // -100 to 100
  greenChannel: number; // -100 to 100
  blueChannel: number; // -100 to 100

  // Blur Effects
  gaussianBlur: number; // 0 to 100
  motionBlurAngle: number; // 0 to 360
  motionBlurDistance: number; // 0 to 100
  radialBlurAmount: number; // 0 to 100
  radialBlurCenterX: number; // 0 to 1 (percentage)
  radialBlurCenterY: number; // 0 to 1 (percentage)
  boxBlur: number; // 0 to 100
  surfaceBlur: number; // 0 to 100

  // Sharpen
  unsharpAmount: number; // 0 to 100
  unsharpRadius: number; // 0 to 100
  unsharpThreshold: number; // 0 to 100
  sharpen: number; // 0 to 100
  clarity: number; // -100 to 100

  // Noise
  addNoise: number; // 0 to 100
  noiseType: 'uniform' | 'gaussian' | 'monochrome';
  reduceNoise: number; // 0 to 100
  median: number; // 0 to 100

  // Distortion
  rippleAmplitude: number; // -100 to 100
  rippleWavelength: number; // 1 to 100
  twirlAngle: number; // -360 to 360
  twirlRadius: number; // 0 to 100
  waveHorizontal: number; // -100 to 100
  waveVertical: number; // -100 to 100
  spherize: number; // -100 to 100
  pinch: number; // -100 to 100
  bulge: number; // 0 to 100

  // Lens Effects
  vignetteAmount: number; // 0 to 100
  vignetteRoundness: number; // 0 to 100
  vignetteFeather: number; // 0 to 100
  lensFlare: number; // 0 to 100
  lensFlareX: number; // 0 to 1
  lensFlareY: number; // 0 to 1
  chromaticAberration: number; // 0 to 100
  lensDistortion: number; // -100 to 100

  // Stylize
  oilPaintBrush: number; // 0 to 100
  oilPaintDetail: number; // 0 to 100
  cartoonEdge: number; // 0 to 100
  cartoonColors: number; // 2 to 20
  glowingEdgesWidth: number; // 0 to 100
  glowingEdgesIntensity: number; // 0 to 100
  sketchDetail: number; // 0 to 100
  sketchShading: number; // 0 to 100
  watercolorGranularity: number; // 0 to 100
  watercolorIntensity: number; // 0 to 100
  embossAngle: number; // 0 to 360
  embossAmount: number; // 0 to 100
  edgeDetection: number; // 0 to 100
  pixelate: number; // 1 to 100
  mosaic: number; // 1 to 100

  // Special Effects
  posterize: number; // 2 to 256
  solarize: number; // 0 to 255
  threshold: number; // 0 to 255
  halftone: number; // 0 to 100
  crystallize: number; // 0 to 100;

  // Chroma Key
  chromaKeyEnabled: boolean;
  chromaKeyColor: string; // hex color e.g. '#00ff00'
  chromaKeySimilarity: number; // 0 to 100
  chromaKeyEdgeSmoothness: number; // 0 to 100
  chromaKeySpillReduction: number; // 0 to 100
}

export interface CanvasState {
  zoom: number;
  pan: { x: number; y: number };
  showGrid: boolean;
  selectedTool: string;
}