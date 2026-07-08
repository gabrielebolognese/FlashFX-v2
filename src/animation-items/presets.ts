import type {
  AnimationItemConfig,
  DataSourceConfig,
  ProgressBarConfig,
  StopwatchConfig,
  CounterConfig,
  RatingStarsConfig,
  LoadingSpinnerConfig,
  GaugeConfig,
} from './types';

export interface AnimationItemPreset {
  name: string;
  description: string;
  itemConfig: AnimationItemConfig;
  dataSource: DataSourceConfig;
}

function defaultDataSource(start = 0, end = 1): DataSourceConfig {
  return { mode: 'simulated', simulatedStart: start, simulatedEnd: end, simulatedEasing: 'easeOut' };
}

export const ANIMATION_ITEM_PRESETS: AnimationItemPreset[] = [
  {
    name: 'Progress Bar',
    description: 'Linear progress bar with percentage label',
    itemConfig: {
      type: 'progressBar',
      config: {
        shape: 'linear', direction: 'ltr',
        segmentCount: 10, segmentGap: 4,
        radialStartAngle: -90, radialSweep: 360,
        trackWidth: 300, trackHeight: 24,
        showLabel: true, labelFormat: 'percent', labelTemplate: '{value}%',
        trackStyle: { fillColor: [0.12, 0.15, 0.22, 1], cornerRadius: 12 },
        fillStyle: { fillColor: [0.96, 0.71, 0, 1], cornerRadius: 10 },
        labelStyle: { fillColor: [1, 1, 1, 1], fontSize: 12, fontWeight: 600 },
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Radial Progress',
    description: 'Circular progress ring with center percentage',
    itemConfig: {
      type: 'progressBar',
      config: {
        shape: 'radial', direction: 'ltr',
        segmentCount: 10, segmentGap: 4,
        radialStartAngle: -90, radialSweep: 360,
        trackWidth: 150, trackHeight: 150,
        showLabel: true, labelFormat: 'percent', labelTemplate: '{value}%',
        trackStyle: { fillColor: [0.12, 0.15, 0.22, 1], strokeWidth: 10 },
        fillStyle: { fillColor: [0.2, 0.8, 0.4, 1], strokeWidth: 10 },
        labelStyle: { fillColor: [1, 1, 1, 1], fontSize: 28, fontWeight: 700 },
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Segmented Bar',
    description: 'Chunked progress bar with discrete segments',
    itemConfig: {
      type: 'progressBar',
      config: {
        shape: 'segmented', direction: 'ltr',
        segmentCount: 8, segmentGap: 6,
        radialStartAngle: -90, radialSweep: 360,
        trackWidth: 280, trackHeight: 20,
        showLabel: false, labelFormat: 'percent', labelTemplate: '{value}%',
        trackStyle: { fillColor: [0.15, 0.18, 0.25, 1], cornerRadius: 4 },
        fillStyle: { fillColor: [0.3, 0.6, 1, 1] },
        labelStyle: { fillColor: [1, 1, 1, 1] },
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Digital Stopwatch',
    description: 'Digital timer counting up',
    itemConfig: {
      type: 'stopwatch',
      config: {
        variant: 'digital', showHours: false, showMilliseconds: true,
        totalDurationSeconds: 60, direction: 'up',
        faceStyle: {}, digitStyle: { fillColor: [1, 1, 1, 1], fontSize: 48, fontFamily: 'monospace', fontWeight: 700 },
        separatorStyle: {}, handStyle: {},
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Analog Clock',
    description: 'Analog clock face with moving hands',
    itemConfig: {
      type: 'stopwatch',
      config: {
        variant: 'analog', showHours: true, showMilliseconds: false,
        totalDurationSeconds: 60, direction: 'up',
        faceStyle: { fillColor: [0.06, 0.08, 0.12, 1], strokeColor: [0.3, 0.35, 0.4, 1], strokeWidth: 3 },
        digitStyle: {}, separatorStyle: {},
        handStyle: { fillColor: [0.9, 0.9, 0.9, 1] },
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Countdown',
    description: 'Digital countdown timer',
    itemConfig: {
      type: 'countdown',
      config: {
        variant: 'digital', showHours: false, showMilliseconds: false,
        totalDurationSeconds: 10, direction: 'down',
        faceStyle: {}, digitStyle: { fillColor: [0.96, 0.3, 0.3, 1], fontSize: 72, fontFamily: 'Inter', fontWeight: 800 },
        separatorStyle: {}, handStyle: {},
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Number Counter',
    description: 'Animated number counting up',
    itemConfig: {
      type: 'counter',
      config: {
        startValue: 0, endValue: 1000,
        decimalPlaces: 0, thousandsSeparator: true,
        prefix: '', suffix: '',
        digitStyle: { fillColor: [1, 1, 1, 1], fontSize: 64, fontFamily: 'Inter', fontWeight: 800 },
        prefixStyle: {},
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Dollar Counter',
    description: 'Money counter with dollar prefix',
    itemConfig: {
      type: 'counter',
      config: {
        startValue: 0, endValue: 25000,
        decimalPlaces: 2, thousandsSeparator: true,
        prefix: '$', suffix: '',
        digitStyle: { fillColor: [0.2, 0.9, 0.4, 1], fontSize: 56, fontFamily: 'Inter', fontWeight: 700 },
        prefixStyle: { fillColor: [0.2, 0.9, 0.4, 0.7] },
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Rating Stars',
    description: 'Animated star rating fill',
    itemConfig: {
      type: 'ratingStars',
      config: {
        maxStars: 5, targetValue: 4.5,
        starSize: 32, starGap: 8,
        animateSequentially: true,
        filledStyle: { fillColor: [0.96, 0.71, 0, 1] },
        emptyStyle: { fillColor: [0.2, 0.22, 0.28, 1] },
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Loading Dots',
    description: 'Circular loading dots animation',
    itemConfig: {
      type: 'loadingSpinner',
      config: {
        variant: 'dots', elementCount: 8, size: 60, speed: 3,
        dotStyle: { fillColor: [0.96, 0.71, 0, 1] },
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Loading Ring',
    description: 'Spinning ring loader',
    itemConfig: {
      type: 'loadingSpinner',
      config: {
        variant: 'ring', elementCount: 1, size: 50, speed: 2,
        dotStyle: { fillColor: [0.3, 0.6, 1, 1] },
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Equalizer Bars',
    description: 'Audio-style bar animation',
    itemConfig: {
      type: 'loadingSpinner',
      config: {
        variant: 'bars', elementCount: 5, size: 40, speed: 4,
        dotStyle: { fillColor: [0.2, 0.8, 0.5, 1] },
      },
    },
    dataSource: defaultDataSource(),
  },
  {
    name: 'Speed Gauge',
    description: 'Semi-circular gauge with needle',
    itemConfig: {
      type: 'gauge',
      config: {
        minValue: 0, maxValue: 100,
        startAngle: -135, sweepAngle: 270,
        showTicks: true, tickCount: 10,
        showNeedle: true, showValueLabel: true,
        labelFormat: '{value}',
        trackStyle: { fillColor: [0.12, 0.15, 0.22, 1], strokeWidth: 14 },
        fillStyle: { fillColor: [0.96, 0.4, 0.1, 1], strokeWidth: 14 },
        needleStyle: { fillColor: [0.96, 0.2, 0.2, 1] },
        labelStyle: { fillColor: [1, 1, 1, 1], fontSize: 32, fontWeight: 700 },
      },
    },
    dataSource: defaultDataSource(),
  },
];

export const ANIMATION_ITEM_PRESET_NAMES = ANIMATION_ITEM_PRESETS.map((p) => p.name);
