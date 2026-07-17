import { ImageFilters } from '../types/design';

export const getDefaultImageFilters = (): ImageFilters => ({
  // Basic Adjustments
  brightness: 0,
  contrast: 0,
  exposure: 0,
  gamma: 1.0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,

  // HSL Adjustments
  hue: 0,
  lightness: 0,
  grayscale: 0,
  invert: false,
  sepia: 0,

  // Color Balance
  shadowsRed: 0,
  shadowsGreen: 0,
  shadowsBlue: 0,
  midtonesRed: 0,
  midtonesGreen: 0,
  midtonesBlue: 0,
  highlightsRed: 0,
  highlightsGreen: 0,
  highlightsBlue: 0,

  // Levels
  levelsBlackPoint: 0,
  levelsMidPoint: 1.0,
  levelsWhitePoint: 255,

  // RGB Channels
  redChannel: 0,
  greenChannel: 0,
  blueChannel: 0,

  // Blur Effects
  gaussianBlur: 0,
  motionBlurAngle: 0,
  motionBlurDistance: 0,
  radialBlurAmount: 0,
  radialBlurCenterX: 0.5,
  radialBlurCenterY: 0.5,
  boxBlur: 0,
  surfaceBlur: 0,

  // Sharpen
  unsharpAmount: 0,
  unsharpRadius: 0,
  unsharpThreshold: 0,
  sharpen: 0,
  clarity: 0,

  // Noise
  addNoise: 0,
  noiseType: 'uniform',
  reduceNoise: 0,
  median: 0,

  // Distortion
  rippleAmplitude: 0,
  rippleWavelength: 50,
  twirlAngle: 0,
  twirlRadius: 50,
  waveHorizontal: 0,
  waveVertical: 0,
  spherize: 0,
  pinch: 0,
  bulge: 0,

  // Lens Effects
  vignetteAmount: 0,
  vignetteRoundness: 50,
  vignetteFeather: 50,
  lensFlare: 0,
  lensFlareX: 0.5,
  lensFlareY: 0.5,
  chromaticAberration: 0,
  lensDistortion: 0,

  // Stylize
  oilPaintBrush: 0,
  oilPaintDetail: 50,
  cartoonEdge: 0,
  cartoonColors: 8,
  glowingEdgesWidth: 0,
  glowingEdgesIntensity: 0,
  sketchDetail: 0,
  sketchShading: 50,
  watercolorGranularity: 50,
  watercolorIntensity: 0,
  embossAngle: 45,
  embossAmount: 0,
  edgeDetection: 0,
  pixelate: 1,
  mosaic: 1,

  // Special Effects
  posterize: 256,
  solarize: 128,
  threshold: 128,
  halftone: 0,
  crystallize: 0,

  // Chroma Key
  chromaKeyEnabled: false,
  chromaKeyColor: '#00ff00',
  chromaKeySimilarity: 0,
  chromaKeyEdgeSmoothness: 10,
  chromaKeySpillReduction: 20,
});

export const hasActiveFilters = (filters?: ImageFilters): boolean => {
  if (!filters) return false;

  const defaults = getDefaultImageFilters();

  return Object.keys(defaults).some(key => {
    const filterKey = key as keyof ImageFilters;
    return filters[filterKey] !== defaults[filterKey];
  });
};

export const resetFilterCategory = (
  filters: ImageFilters,
  category: 'basic' | 'hsl' | 'colorBalance' | 'levels' | 'rgb' | 'blur' | 'sharpen' | 'noise' | 'distortion' | 'lens' | 'stylize' | 'special' | 'chromaKey' | 'all'
): ImageFilters => {
  const defaults = getDefaultImageFilters();

  const categoryFilters: Record<string, (keyof ImageFilters)[]> = {
    basic: ['brightness', 'contrast', 'exposure', 'gamma', 'temperature', 'tint', 'vibrance', 'saturation'],
    hsl: ['hue', 'lightness', 'grayscale', 'invert', 'sepia'],
    colorBalance: [
      'shadowsRed', 'shadowsGreen', 'shadowsBlue',
      'midtonesRed', 'midtonesGreen', 'midtonesBlue',
      'highlightsRed', 'highlightsGreen', 'highlightsBlue'
    ],
    levels: ['levelsBlackPoint', 'levelsMidPoint', 'levelsWhitePoint'],
    rgb: ['redChannel', 'greenChannel', 'blueChannel'],
    blur: ['gaussianBlur', 'motionBlurAngle', 'motionBlurDistance', 'radialBlurAmount', 'radialBlurCenterX', 'radialBlurCenterY', 'boxBlur', 'surfaceBlur'],
    sharpen: ['unsharpAmount', 'unsharpRadius', 'unsharpThreshold', 'sharpen', 'clarity'],
    noise: ['addNoise', 'noiseType', 'reduceNoise', 'median'],
    distortion: ['rippleAmplitude', 'rippleWavelength', 'twirlAngle', 'twirlRadius', 'waveHorizontal', 'waveVertical', 'spherize', 'pinch', 'bulge'],
    lens: ['vignetteAmount', 'vignetteRoundness', 'vignetteFeather', 'lensFlare', 'lensFlareX', 'lensFlareY', 'chromaticAberration', 'lensDistortion'],
    stylize: [
      'oilPaintBrush', 'oilPaintDetail', 'cartoonEdge', 'cartoonColors',
      'glowingEdgesWidth', 'glowingEdgesIntensity', 'sketchDetail', 'sketchShading',
      'watercolorGranularity', 'watercolorIntensity', 'embossAngle', 'embossAmount',
      'edgeDetection', 'pixelate', 'mosaic'
    ],
    special: ['posterize', 'solarize', 'threshold', 'halftone', 'crystallize'],
    chromaKey: ['chromaKeyEnabled', 'chromaKeyColor', 'chromaKeySimilarity', 'chromaKeyEdgeSmoothness', 'chromaKeySpillReduction'],
  };

  if (category === 'all') {
    return defaults;
  }

  const filtersToReset = categoryFilters[category] || [];
  const newFilters = { ...filters };

  filtersToReset.forEach(key => {
    newFilters[key] = defaults[key];
  });

  return newFilters;
};

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const normalizeFilterValue = (value: number, min: number, max: number, outputMin: number = 0, outputMax: number = 1): number => {
  return ((value - min) / (max - min)) * (outputMax - outputMin) + outputMin;
};
