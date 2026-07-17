export type AnimatableProperty =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'
  | 'opacity'
  | 'fill'
  | 'stroke'
  | 'strokeWidth'
  | 'borderRadius'
  | 'scaleX'
  | 'scaleY'
  | 'shadowBlur'
  | 'shadowX'
  | 'shadowY'
  | 'fontSize'
  | 'letterSpacing'
  | 'lineHeight'
  | 'wordSpacing'
  | 'textColor'
  | 'textStrokeWidth'
  | 'textStrokeColor'
  | 'textShadowBlur'
  | 'textShadowOffsetX'
  | 'textShadowOffsetY'
  | 'textGlowSize'
  | 'textGlowIntensity'
  | 'textGradientAngle'
  | 'textTextureFillScale'
  | 'textTextureFillOffsetX'
  | 'textTextureFillOffsetY'
  | 'textPatternSize'
  | 'textPatternSpacing'
  | 'textPatternAngle'
  | 'baselineShift'
  | 'textIndent'
  | 'textPaddingTop'
  | 'textPaddingRight'
  | 'textPaddingBottom'
  | 'textPaddingLeft'
  | 'stagger'
  | 'gradientAngle'
  | 'gradientCenterX'
  | 'gradientCenterY'
  | 'gradientType'
  | 'shapePatternOpacity'
  | 'shapePatternSize'
  | 'shapePatternSpacing'
  | 'shapePatternAngle'
  | 'starPoints'
  | 'starInnerRadius'
  | 'arrowheadSize'
  | 'smoothing'
  | 'trimStart'
  | 'trimEnd'
  | 'dashIntensity'
  | `gradientColor-${string}`
  | `gradientPos-${string}`
  | `filters.${string}`
  | `threeDSceneState.${string}`
  | 'uvTransform.offsetX'
  | 'uvTransform.offsetY'
  | 'uvTransform.repeatX'
  | 'uvTransform.repeatY'
  | 'uvTransform.rotation'
  | 'uvTransform.centerX'
  | 'uvTransform.centerY';

export type EasingType =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'ease-in-quad'
  | 'ease-out-quad'
  | 'ease-in-out-quad'
  | 'ease-in-cubic'
  | 'ease-out-cubic'
  | 'ease-in-out-cubic'
  | 'ease-in-out-cosine'
  | 'ease-in-expo'
  | 'ease-out-expo'
  | 'ease-in-circ'
  | 'ease-out-circ'
  | 'ease-in-elastic'
  | 'ease-out-elastic'
  | 'ease-out-back'
  | 'ease-out-bounce'
  | 'hold';

export interface EasingConfig {
  type: EasingType;
  label: string;
  description?: string;
  category: 'basic' | 'quad' | 'cubic' | 'cosine' | 'exponential' | 'circular' | 'special';
  icon: 'rhombus' | 'triangle-right' | 'triangle-left' | 'diamond' | 'circle' | 'curve' | 'triangle-sharp-tail' | 'triangle-sharp-head' | 'quarter-circle-right' | 'quarter-circle-left' | 'arrow-loop' | 'wave' | 'bounce' | 'vertical-line';
}

export const EASING_CONFIGS: EasingConfig[] = [
  { type: 'linear', label: 'Linear', description: 'Constant speed', category: 'basic', icon: 'rhombus' },
  { type: 'ease-in-quad', label: 'Ease In (Quadratic)', description: 'Slow start, fast end', category: 'quad', icon: 'triangle-right' },
  { type: 'ease-out-quad', label: 'Ease Out (Quadratic)', description: 'Fast start, slow end', category: 'quad', icon: 'triangle-left' },
  { type: 'ease-in-out-quad', label: 'Ease In Out (Quadratic)', description: 'Slow start, fast middle, slow end', category: 'quad', icon: 'diamond' },
  { type: 'ease-in-cubic', label: 'Ease In (Cubic)', description: 'Very slow start, very fast end', category: 'cubic', icon: 'triangle-right' },
  { type: 'ease-out-cubic', label: 'Ease Out (Cubic)', description: 'Very fast start, very slow end', category: 'cubic', icon: 'triangle-left' },
  { type: 'ease-in-out-cubic', label: 'Ease In Out (Cubic)', description: 'Very slow start, very fast middle, very slow end', category: 'cubic', icon: 'diamond' },
  { type: 'ease-in-out-cosine', label: 'Smoothstep (Cosine)', description: 'Slow start, smooth acceleration, smooth stop', category: 'cosine', icon: 'circle' },
  { type: 'ease-in-expo', label: 'Exponential Ease In', description: 'Extremely slow start, explosive end', category: 'exponential', icon: 'triangle-sharp-tail' },
  { type: 'ease-out-expo', label: 'Exponential Ease Out', description: 'Explosive start, extremely slow end', category: 'exponential', icon: 'triangle-sharp-head' },
  { type: 'ease-in-circ', label: 'Circular Ease In', description: 'Slow start, circular acceleration', category: 'circular', icon: 'quarter-circle-right' },
  { type: 'ease-out-circ', label: 'Circular Ease Out', description: 'Fast start, circular deceleration', category: 'circular', icon: 'quarter-circle-left' },
  { type: 'ease-out-back', label: 'Back Ease Out', description: 'Fast start, overshoot, return', category: 'special', icon: 'arrow-loop' },
  { type: 'ease-out-elastic', label: 'Elastic Ease Out', description: 'Fast start, oscillating stop', category: 'special', icon: 'wave' },
  { type: 'ease-out-bounce', label: 'Bounce', description: 'Bouncing effect', category: 'special', icon: 'bounce' },
  { type: 'hold', label: 'Hold (No interpolation)', description: 'Jump to next value', category: 'basic', icon: 'vertical-line' },
];

export interface BezierHandle {
  x: number;
  y: number;
}

export interface Keyframe {
  id: string;
  time: number;
  value: number | string;
  easing: EasingType;
  handleIn?: BezierHandle;
  handleOut?: BezierHandle;
}

export interface PropertyTrack {
  property: AnimatableProperty;
  keyframes: Keyframe[];
  enabled: boolean;
}

export interface ElementAnimation {
  elementId: string;
  tracks: PropertyTrack[];
  clipStart: number;
  clipDuration: number;
  locked: boolean;
  muted: boolean;
}

export interface Sequence {
  id: string;
  name: string;
  frameRate: number;
  duration: number;
  canvasId: string;
  createdAt: number;
  updatedAt: number;
}

export interface TimelineMarker {
  id: string;
  time: number;
  name: string;
  color: string;
}

export interface TimelineState {
  currentTime: number;
  duration: number;
  fps: number;
  isPlaying: boolean;
  pixelsPerSecond: number;
  selectedClipId: string | null;
  selectedClipIds: string[];
  selectedKeyframeIds: string[];
  loop: boolean;
  currentFrame: number;
  markers: TimelineMarker[];
  snapToMarkers: boolean;
}

export interface AnimationState {
  animations: Record<string, ElementAnimation>;
  timeline: TimelineState;
  sequences: Record<string, Sequence>;
  activeSequenceId: string | null;
}

export interface PropertyConfig {
  property: AnimatableProperty;
  label: string;
  category: 'position' | 'transform' | 'appearance' | 'text';
  type: 'number' | 'color';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export const ANIMATABLE_PROPERTIES: PropertyConfig[] = [
  { property: 'x', label: 'X Position', category: 'position', type: 'number', unit: 'px' },
  { property: 'y', label: 'Y Position', category: 'position', type: 'number', unit: 'px' },
  { property: 'width', label: 'Width', category: 'transform', type: 'number', min: 1, unit: 'px' },
  { property: 'height', label: 'Height', category: 'transform', type: 'number', min: 1, unit: 'px' },
  { property: 'rotation', label: 'Rotation', category: 'transform', type: 'number', min: -360, max: 360, unit: 'deg' },
  { property: 'scaleX', label: 'Scale X', category: 'transform', type: 'number', min: 0, max: 10, step: 0.1 },
  { property: 'scaleY', label: 'Scale Y', category: 'transform', type: 'number', min: 0, max: 10, step: 0.1 },
  { property: 'opacity', label: 'Opacity', category: 'appearance', type: 'number', min: 0, max: 1, step: 0.01 },
  { property: 'fill', label: 'Fill Color', category: 'appearance', type: 'color' },
  { property: 'stroke', label: 'Stroke Color', category: 'appearance', type: 'color' },
  { property: 'strokeWidth', label: 'Stroke Width', category: 'appearance', type: 'number', min: 0, unit: 'px' },
  { property: 'borderRadius', label: 'Border Radius', category: 'appearance', type: 'number', min: 0, unit: 'px' },
  { property: 'shadowBlur', label: 'Shadow Blur', category: 'appearance', type: 'number', min: 0, unit: 'px' },
  { property: 'shadowX', label: 'Shadow X', category: 'appearance', type: 'number', unit: 'px' },
  { property: 'shadowY', label: 'Shadow Y', category: 'appearance', type: 'number', unit: 'px' },
  { property: 'fontSize', label: 'Font Size', category: 'text', type: 'number', min: 1, unit: 'px' },
  { property: 'letterSpacing', label: 'Letter Spacing', category: 'text', type: 'number', unit: 'px' },
  { property: 'lineHeight', label: 'Line Height', category: 'text', type: 'number', min: 0.5, max: 5, step: 0.1 },
];

export const PROPERTY_CATEGORIES = [
  { id: 'position', label: 'Position', icon: 'move' },
  { id: 'transform', label: 'Transform', icon: 'maximize' },
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'text', label: 'Text', icon: 'type' },
] as const;

export const DEFAULT_TIMELINE_STATE: TimelineState = {
  currentTime: 0,
  duration: 10,
  fps: 30,
  isPlaying: false,
  pixelsPerSecond: 100,
  selectedClipId: null,
  selectedClipIds: [],
  selectedKeyframeIds: [],
  loop: false,
  currentFrame: 0,
  markers: [],
  snapToMarkers: true,
};

export function createMarker(time: number, name: string = 'Marker', color: string = '#3b82f6'): TimelineMarker {
  return {
    id: `marker-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    time,
    name,
    color,
  };
}

export function createSequence(
  name: string,
  frameRate: number,
  duration: number,
  canvasId: string
): Sequence {
  const now = Date.now();
  return {
    id: `seq-${now}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    frameRate,
    duration,
    canvasId,
    createdAt: now,
    updatedAt: now,
  };
}

export function getSequenceTotalFrames(sequence: Sequence): number {
  return Math.ceil(sequence.duration * sequence.frameRate);
}

/**
 * Convert a global timeline position to a clip-local time offset.
 * Keyframe times are stored in clip-local coordinates — seconds elapsed
 * from the clip's own start, not from the global timeline origin.
 */
export function globalToLocalTime(globalTime: number, clipStartTime: number): number {
  return globalTime - clipStartTime;
}

/**
 * Convert a clip-local time offset to a global timeline position.
 * Use this when you need to translate a stored clip-local keyframe time
 * back to an absolute position on the global timeline.
 */
export function localToGlobalTime(localTime: number, clipStartTime: number): number {
  return localTime + clipStartTime;
}

export function getFrameTime(frameRate: number, frameIndex: number): number {
  return frameIndex / frameRate;
}

export function getFrameAtTime(frameRate: number, time: number): number {
  return Math.floor(time * frameRate);
}

export function getFrameDuration(frameRate: number): number {
  return 1 / frameRate;
}

export function createDefaultElementAnimation(elementId: string, clipStart = 0): ElementAnimation {
  return {
    elementId,
    tracks: [],
    clipStart,
    clipDuration: 5,
    locked: false,
    muted: false,
  };
}

export function createKeyframe(time: number, value: number | string, easing: EasingType = 'ease-out'): Keyframe {
  return {
    id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    time,
    value,
    easing,
  };
}

export function createPropertyTrack(property: AnimatableProperty): PropertyTrack {
  return {
    property,
    keyframes: [],
    enabled: true,
  };
}
