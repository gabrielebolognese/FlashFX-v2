export type AnimatableProperty =
  | 'x' | 'y' | 'width' | 'height'
  | 'rotation' | 'opacity' | 'scaleX' | 'scaleY'
  | 'fill' | 'stroke' | 'strokeWidth' | 'borderRadius'
  | 'shadowBlur' | 'shadowX' | 'shadowY'
  | 'fontSize' | 'letterSpacing' | 'lineHeight'
  | 'gradientAngle' | 'gradientType'
  | `gradientColor-${string}`;

export type EasingType =
  | 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out'
  | 'ease-in-quad' | 'ease-out-quad' | 'ease-in-out-quad'
  | 'ease-in-cubic' | 'ease-out-cubic' | 'ease-in-out-cubic'
  | 'ease-in-out-cosine' | 'ease-in-expo' | 'ease-out-expo'
  | 'ease-in-circ' | 'ease-out-circ'
  | 'ease-in-elastic' | 'ease-out-elastic'
  | 'ease-out-back' | 'ease-out-bounce' | 'hold';

export type EasingFunction = (t: number) => number;

export interface BezierHandle {
  x: number;
  y: number;
}

export interface EngineKeyframe {
  id: string;
  time: number;
  value: number | string;
  easing: EasingType;
  handleIn?: BezierHandle;
  handleOut?: BezierHandle;
}

export interface EngineTrack {
  property: AnimatableProperty;
  keyframes: EngineKeyframe[];
  enabled: boolean;
}

export interface EngineClip {
  elementId: string;
  tracks: EngineTrack[];
  clipStart: number;
  clipDuration: number;
  locked: boolean;
  muted: boolean;
}

export type ResolvedProperties = Record<string, number | string | undefined>;

export interface FrameState {
  time: number;
  frame: number;
  elements: Map<string, ResolvedProperties>;
}

export interface TimelineConfig {
  fps: number;
  duration: number;
  loop: boolean;
}

export interface RenderElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  scaleX: number;
  scaleY: number;
  visible?: boolean;
  locked?: boolean;
  name?: string;
  shadow?: { blur: number; color: string; x: number; y: number };
  innerShadow?: {
    enabled?: boolean;
    blur: number;
    color: string;
    x: number;
    y: number;
    borders?: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  };
  blendMode?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: string;
  letterSpacing?: number;
  lineHeight?: number;
  textVerticalAlign?: string;
  imageData?: string;
  points?: Array<{ x: number; y: number; smooth?: boolean; radius?: number }>;
  lineType?: string;
  arrowStart?: boolean;
  arrowEnd?: boolean;
  children?: RenderElement[];
  materialConfig?: unknown;
  cornerRadius?: number;
  /** Animation target level for text elements. "object" = single-node render (default). */
  animationTargetLevel?: 'object' | 'line' | 'word' | 'char';
  /** Stagger delay in seconds between successive text segments. Default: 0 */
  stagger?: number;
  /** Order in which segments receive staggered animations. Default: "forward" */
  order?: 'forward' | 'reverse' | 'random';
  /** When true, clip each segment to its bounding box for reveal animations. Default: false */
  masking?: boolean;
  textGradientEnabled?: boolean;
  textGradientType?: 'linear' | 'radial';
  textGradientColors?: Array<{ color: string; position: number; id: string }>;
  textGradientAngle?: number;
}

export interface RenderFrame {
  time: number;
  frame: number;
  canvasWidth: number;
  canvasHeight: number;
  elements: RenderElement[];
  background?: {
    enabled: boolean;
    type?: string;
    color?: string;
    gradient?: {
      type?: string;
      angle?: number;
      stops?: Array<{ position: number; color: string }>;
    };
    layers?: Array<{
      type: string;
      opacity?: number;
      blendMode?: string;
      angle?: number;
      colorStops?: Array<{ position: number; color: string }>;
    }>;
  };
}

export type PlaybackState = 'playing' | 'paused' | 'stopped';

export interface SchedulerCallbacks {
  onFrame: (time: number, frame: number) => void;
  onStateChange: (state: PlaybackState) => void;
  onComplete: () => void;
}
