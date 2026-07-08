export type AnimationItemType =
  | 'progressBar'
  | 'stopwatch'
  | 'countdown'
  | 'counter'
  | 'ratingStars'
  | 'loadingSpinner'
  | 'gauge';

export type DataSourceMode = 'simulated' | 'live';

export interface SimulatedKeyframe {
  frame: number;
  value: number;
}

export interface DataSourceConfig {
  mode: DataSourceMode;
  simulatedStart: number;
  simulatedEnd: number;
  simulatedEasing: 'linear' | 'easeOut' | 'easeInOut' | 'spring';
  simulatedKeyframes?: SimulatedKeyframe[];
}

export interface SubElementStyle {
  fillColor?: [number, number, number, number];
  strokeColor?: [number, number, number, number];
  strokeWidth?: number;
  cornerRadius?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
}

// --- Progress Bar ---
export interface ProgressBarConfig {
  shape: 'linear' | 'radial' | 'segmented';
  direction: 'ltr' | 'rtl' | 'btt' | 'ttb';
  segmentCount: number;
  segmentGap: number;
  radialStartAngle: number;
  radialSweep: number;
  trackWidth: number;
  trackHeight: number;
  showLabel: boolean;
  labelFormat: 'percent' | 'fraction' | 'custom';
  labelTemplate: string;
  trackStyle: SubElementStyle;
  fillStyle: SubElementStyle;
  labelStyle: SubElementStyle;
}

// --- Stopwatch / Countdown ---
export interface StopwatchConfig {
  variant: 'digital' | 'analog';
  showHours: boolean;
  showMilliseconds: boolean;
  totalDurationSeconds: number;
  direction: 'up' | 'down';
  faceStyle: SubElementStyle;
  digitStyle: SubElementStyle;
  separatorStyle: SubElementStyle;
  handStyle: SubElementStyle;
}

// --- Counter ---
export interface CounterConfig {
  startValue: number;
  endValue: number;
  decimalPlaces: number;
  thousandsSeparator: boolean;
  prefix: string;
  suffix: string;
  digitStyle: SubElementStyle;
  prefixStyle: SubElementStyle;
}

// --- Rating Stars ---
export interface RatingStarsConfig {
  maxStars: number;
  targetValue: number;
  starSize: number;
  starGap: number;
  animateSequentially: boolean;
  filledStyle: SubElementStyle;
  emptyStyle: SubElementStyle;
}

// --- Loading Spinner ---
export interface LoadingSpinnerConfig {
  variant: 'dots' | 'ring' | 'bars' | 'pulse';
  elementCount: number;
  size: number;
  speed: number;
  dotStyle: SubElementStyle;
}

// --- Gauge ---
export interface GaugeConfig {
  minValue: number;
  maxValue: number;
  startAngle: number;
  sweepAngle: number;
  showTicks: boolean;
  tickCount: number;
  showNeedle: boolean;
  showValueLabel: boolean;
  labelFormat: string;
  trackStyle: SubElementStyle;
  fillStyle: SubElementStyle;
  needleStyle: SubElementStyle;
  labelStyle: SubElementStyle;
}

export type AnimationItemConfig =
  | { type: 'progressBar'; config: ProgressBarConfig }
  | { type: 'stopwatch'; config: StopwatchConfig }
  | { type: 'countdown'; config: StopwatchConfig }
  | { type: 'counter'; config: CounterConfig }
  | { type: 'ratingStars'; config: RatingStarsConfig }
  | { type: 'loadingSpinner'; config: LoadingSpinnerConfig }
  | { type: 'gauge'; config: GaugeConfig };

export interface ResolvedAnimationElement {
  kind: 'shape' | 'text';
  transform: {
    x: number; y: number;
    rotation: number;
    scaleX: number; scaleY: number;
    anchorX: number; anchorY: number;
    opacity: number;
  };
  shape?: {
    type: 'rectangle' | 'circle' | 'arc';
    width: number; height: number;
    fillColor: [number, number, number, number];
    strokeColor: [number, number, number, number];
    strokeWidth: number;
    cornerRadius: number;
    arcStart?: number;
    arcSweep?: number;
  };
  text?: {
    content: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    fillColor: [number, number, number, number];
    align: 'left' | 'center' | 'right';
  };
}
