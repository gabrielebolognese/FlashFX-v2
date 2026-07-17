import { DesignElement } from '../types/design';

export type PropertyValueType = 'number' | 'color' | 'percentage';

export interface KeyframeableProperty {
  property: string;
  label: string;
  type: PropertyValueType;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  category: string;
  categoryLabel: string;
}

export type ElementKind =
  | 'shape'
  | 'text'
  | 'image'
  | 'video'
  | 'line'
  | 'gradient'
  | 'group';

export function getElementKind(element: DesignElement): ElementKind {
  if (element.type === 'text') return 'text';
  if (element.type === 'image') return 'image';
  if (element.type === 'video') return 'video';
if (element.type === 'line') return 'line';
  if (element.type === 'gradient') return 'gradient';
  if (element.type === 'group') return 'group';
  return 'shape';
}

const TRANSFORM_PROPS: KeyframeableProperty[] = [
  { property: 'x', label: 'X Position', type: 'number', unit: 'px', category: 'transform', categoryLabel: 'Transform' },
  { property: 'y', label: 'Y Position', type: 'number', unit: 'px', category: 'transform', categoryLabel: 'Transform' },
  { property: 'width', label: 'Width', type: 'number', min: 1, unit: 'px', category: 'transform', categoryLabel: 'Transform' },
  { property: 'height', label: 'Height', type: 'number', min: 1, unit: 'px', category: 'transform', categoryLabel: 'Transform' },
  { property: 'rotation', label: 'Rotation', type: 'number', min: -360, max: 360, unit: 'deg', category: 'transform', categoryLabel: 'Transform' },
  { property: 'scaleX', label: 'Scale X', type: 'number', min: 0, max: 10, step: 0.01, category: 'transform', categoryLabel: 'Transform' },
  { property: 'scaleY', label: 'Scale Y', type: 'number', min: 0, max: 10, step: 0.01, category: 'transform', categoryLabel: 'Transform' },
  { property: 'opacity', label: 'Opacity', type: 'number', min: 0, max: 1, step: 0.01, category: 'transform', categoryLabel: 'Transform' },
];

const FILL_PROPS: KeyframeableProperty[] = [
  { property: 'fill', label: 'Fill Color', type: 'color', category: 'fill', categoryLabel: 'Fill' },
  { property: 'gradientAngle', label: 'Gradient Angle', type: 'number', min: 0, max: 360, unit: 'deg', category: 'fill', categoryLabel: 'Fill' },
  { property: 'gradientCenterX', label: 'Gradient Center X', type: 'percentage', min: 0, max: 100, unit: '%', category: 'fill', categoryLabel: 'Fill' },
  { property: 'gradientCenterY', label: 'Gradient Center Y', type: 'percentage', min: 0, max: 100, unit: '%', category: 'fill', categoryLabel: 'Fill' },
  { property: 'shapePatternOpacity', label: 'Pattern Opacity', type: 'number', min: 0, max: 1, step: 0.01, category: 'fill', categoryLabel: 'Fill' },
  { property: 'shapePatternSize', label: 'Pattern Size', type: 'number', min: 1, max: 100, category: 'fill', categoryLabel: 'Fill' },
  { property: 'shapePatternSpacing', label: 'Pattern Spacing', type: 'number', min: 0, max: 100, category: 'fill', categoryLabel: 'Fill' },
  { property: 'shapePatternAngle', label: 'Pattern Angle', type: 'number', min: 0, max: 360, unit: 'deg', category: 'fill', categoryLabel: 'Fill' },
];

const STROKE_PROPS: KeyframeableProperty[] = [
  { property: 'stroke', label: 'Stroke Color', type: 'color', category: 'stroke', categoryLabel: 'Stroke' },
  { property: 'strokeWidth', label: 'Stroke Width', type: 'number', min: 0, unit: 'px', category: 'stroke', categoryLabel: 'Stroke' },
];

const SHADOW_PROPS: KeyframeableProperty[] = [
  { property: 'shadowBlur', label: 'Shadow Blur', type: 'number', min: 0, unit: 'px', category: 'shadow', categoryLabel: 'Shadow' },
  { property: 'shadowX', label: 'Shadow X', type: 'number', unit: 'px', category: 'shadow', categoryLabel: 'Shadow' },
  { property: 'shadowY', label: 'Shadow Y', type: 'number', unit: 'px', category: 'shadow', categoryLabel: 'Shadow' },
];

const SHAPE_SPECIFIC_PROPS: KeyframeableProperty[] = [
  { property: 'borderRadius', label: 'Corner Radius', type: 'number', min: 0, unit: 'px', category: 'geometry', categoryLabel: 'Geometry' },
  { property: 'starPoints', label: 'Star Points', type: 'number', min: 3, max: 20, step: 1, category: 'geometry', categoryLabel: 'Geometry' },
  { property: 'starInnerRadius', label: 'Inner Radius Ratio', type: 'number', min: 0, max: 1, step: 0.01, category: 'geometry', categoryLabel: 'Geometry' },
  { property: 'arrowheadSize', label: 'Arrowhead Size', type: 'number', min: 0, max: 100, unit: 'px', category: 'geometry', categoryLabel: 'Geometry' },
  { property: 'smoothing', label: 'Path Smoothing', type: 'number', min: 0, max: 1, step: 0.01, category: 'geometry', categoryLabel: 'Geometry' },
  { property: 'trimStart', label: 'Trim Start', type: 'percentage', min: 0, max: 100, unit: '%', category: 'geometry', categoryLabel: 'Geometry' },
  { property: 'trimEnd', label: 'Trim End', type: 'percentage', min: 0, max: 100, unit: '%', category: 'geometry', categoryLabel: 'Geometry' },
  { property: 'dashIntensity', label: 'Dash Intensity', type: 'number', min: 0, max: 100, category: 'geometry', categoryLabel: 'Geometry' },
];

const TEXT_PROPS: KeyframeableProperty[] = [
  { property: 'fontSize', label: 'Font Size', type: 'number', min: 1, unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'letterSpacing', label: 'Letter Spacing', type: 'number', unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'lineHeight', label: 'Line Height', type: 'number', min: 0.5, max: 10, step: 0.01, category: 'text', categoryLabel: 'Text' },
  { property: 'wordSpacing', label: 'Word Spacing', type: 'number', unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textColor', label: 'Text Color', type: 'color', category: 'text', categoryLabel: 'Text' },
  { property: 'textStrokeWidth', label: 'Text Stroke Width', type: 'number', min: 0, unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textStrokeColor', label: 'Text Stroke Color', type: 'color', category: 'text', categoryLabel: 'Text' },
  { property: 'textShadowBlur', label: 'Text Shadow Blur', type: 'number', min: 0, unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textShadowOffsetX', label: 'Text Shadow X', type: 'number', unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textShadowOffsetY', label: 'Text Shadow Y', type: 'number', unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textGlowSize', label: 'Glow Size', type: 'number', min: 0, unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textGlowIntensity', label: 'Glow Intensity', type: 'number', min: 0, max: 1, step: 0.01, category: 'text', categoryLabel: 'Text' },
  { property: 'textGradientAngle', label: 'Gradient Angle', type: 'number', min: 0, max: 360, unit: 'deg', category: 'text', categoryLabel: 'Text' },
  { property: 'textTextureFillScale', label: 'Texture Scale', type: 'number', min: 0.01, max: 10, step: 0.01, category: 'text', categoryLabel: 'Text' },
  { property: 'textTextureFillOffsetX', label: 'Texture Offset X', type: 'number', unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textTextureFillOffsetY', label: 'Texture Offset Y', type: 'number', unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textPatternSize', label: 'Pattern Size', type: 'number', min: 1, max: 100, category: 'text', categoryLabel: 'Text' },
  { property: 'textPatternSpacing', label: 'Pattern Spacing', type: 'number', min: 0, max: 100, category: 'text', categoryLabel: 'Text' },
  { property: 'textPatternAngle', label: 'Pattern Angle', type: 'number', min: 0, max: 360, unit: 'deg', category: 'text', categoryLabel: 'Text' },
  { property: 'baselineShift', label: 'Baseline Shift', type: 'number', unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textIndent', label: 'Text Indent', type: 'number', unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textPaddingTop', label: 'Padding Top', type: 'number', min: 0, unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textPaddingRight', label: 'Padding Right', type: 'number', min: 0, unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textPaddingBottom', label: 'Padding Bottom', type: 'number', min: 0, unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'textPaddingLeft', label: 'Padding Left', type: 'number', min: 0, unit: 'px', category: 'text', categoryLabel: 'Text' },
  { property: 'stagger', label: 'Anim Stagger', type: 'number', min: 0, max: 2, step: 0.01, unit: 's', category: 'text', categoryLabel: 'Text' },
];

const IMAGE_COLOR_PROPS: KeyframeableProperty[] = [
  { property: 'filters.brightness', label: 'Brightness', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.contrast', label: 'Contrast', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.exposure', label: 'Exposure', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.gamma', label: 'Gamma', type: 'number', min: 0.1, max: 3, step: 0.01, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.temperature', label: 'Temperature', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.tint', label: 'Tint', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.vibrance', label: 'Vibrance', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.saturation', label: 'Saturation', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.hue', label: 'Hue', type: 'number', min: -180, max: 180, unit: 'deg', category: 'color', categoryLabel: 'Color' },
  { property: 'filters.lightness', label: 'Lightness', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.grayscale', label: 'Grayscale', type: 'number', min: 0, max: 100, unit: '%', category: 'color', categoryLabel: 'Color' },
  { property: 'filters.sepia', label: 'Sepia', type: 'number', min: 0, max: 100, unit: '%', category: 'color', categoryLabel: 'Color' },
  { property: 'filters.shadowsRed', label: 'Shadows Red', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.shadowsGreen', label: 'Shadows Green', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.shadowsBlue', label: 'Shadows Blue', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.midtonesRed', label: 'Midtones Red', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.midtonesGreen', label: 'Midtones Green', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.midtonesBlue', label: 'Midtones Blue', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.highlightsRed', label: 'Highlights Red', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.highlightsGreen', label: 'Highlights Green', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.highlightsBlue', label: 'Highlights Blue', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.levelsBlackPoint', label: 'Levels Black', type: 'number', min: 0, max: 255, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.levelsMidPoint', label: 'Levels Mid', type: 'number', min: 0.1, max: 9.99, step: 0.01, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.levelsWhitePoint', label: 'Levels White', type: 'number', min: 0, max: 255, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.redChannel', label: 'Red Channel', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.greenChannel', label: 'Green Channel', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  { property: 'filters.blueChannel', label: 'Blue Channel', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
];

const IMAGE_FILTER_PROPS: KeyframeableProperty[] = [
  { property: 'filters.gaussianBlur', label: 'Gaussian Blur', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.boxBlur', label: 'Box Blur', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.surfaceBlur', label: 'Surface Blur', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.motionBlurAngle', label: 'Motion Blur Angle', type: 'number', min: 0, max: 360, unit: 'deg', category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.motionBlurDistance', label: 'Motion Blur Distance', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.radialBlurAmount', label: 'Radial Blur', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.radialBlurCenterX', label: 'Radial Center X', type: 'percentage', min: 0, max: 100, unit: '%', category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.radialBlurCenterY', label: 'Radial Center Y', type: 'percentage', min: 0, max: 100, unit: '%', category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.sharpen', label: 'Sharpen', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.clarity', label: 'Clarity', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.unsharpAmount', label: 'Unsharp Amount', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.unsharpRadius', label: 'Unsharp Radius', type: 'number', min: 0, max: 50, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.unsharpThreshold', label: 'Unsharp Threshold', type: 'number', min: 0, max: 255, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.addNoise', label: 'Add Noise', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.reduceNoise', label: 'Reduce Noise', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.vignetteAmount', label: 'Vignette', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.vignetteRoundness', label: 'Vignette Roundness', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.vignetteFeather', label: 'Vignette Feather', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.chromaticAberration', label: 'Chromatic Aberration', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.lensDistortion', label: 'Lens Distortion', type: 'number', min: -100, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.rippleAmplitude', label: 'Ripple Amplitude', type: 'number', min: 0, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.rippleWavelength', label: 'Ripple Wavelength', type: 'number', min: 1, max: 200, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.twirlAngle', label: 'Twirl Angle', type: 'number', min: -360, max: 360, unit: 'deg', category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.twirlRadius', label: 'Twirl Radius', type: 'number', min: 0, max: 500, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.spherize', label: 'Spherize', type: 'number', min: -100, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.pinch', label: 'Pinch', type: 'number', min: -100, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.bulge', label: 'Bulge', type: 'number', min: -100, max: 100, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.posterize', label: 'Posterize', type: 'number', min: 2, max: 255, step: 1, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.threshold', label: 'Threshold', type: 'number', min: 0, max: 255, step: 1, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.pixelate', label: 'Pixelate', type: 'number', min: 1, max: 100, step: 1, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.chromaKeySimilarity', label: 'Chroma Similarity', type: 'number', min: 0, max: 1, step: 0.01, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.chromaKeyEdgeSmoothness', label: 'Chroma Edge Smooth', type: 'number', min: 0, max: 1, step: 0.01, category: 'filters', categoryLabel: 'Filters' },
  { property: 'filters.chromaKeySpillReduction', label: 'Chroma Spill', type: 'number', min: 0, max: 1, step: 0.01, category: 'filters', categoryLabel: 'Filters' },
];


const GRADIENT_PROPS: KeyframeableProperty[] = [
  { property: 'gradientAngle', label: 'Gradient Angle', type: 'number', min: 0, max: 360, unit: 'deg', category: 'gradient', categoryLabel: 'Gradient' },
  { property: 'gradientCenterX', label: 'Center X', type: 'percentage', min: 0, max: 100, unit: '%', category: 'gradient', categoryLabel: 'Gradient' },
  { property: 'gradientCenterY', label: 'Center Y', type: 'percentage', min: 0, max: 100, unit: '%', category: 'gradient', categoryLabel: 'Gradient' },
];

const LINE_SPECIFIC_PROPS: KeyframeableProperty[] = [
  { property: 'strokeWidth', label: 'Line Width', type: 'number', min: 0, unit: 'px', category: 'line', categoryLabel: 'Line' },
  { property: 'stroke', label: 'Line Color', type: 'color', category: 'line', categoryLabel: 'Line' },
  { property: 'arrowheadSize', label: 'Arrowhead Size', type: 'number', min: 0, unit: 'px', category: 'line', categoryLabel: 'Line' },
  { property: 'trimStart', label: 'Trim Start', type: 'percentage', min: 0, max: 100, unit: '%', category: 'line', categoryLabel: 'Line' },
  { property: 'trimEnd', label: 'Trim End', type: 'percentage', min: 0, max: 100, unit: '%', category: 'line', categoryLabel: 'Line' },
  { property: 'dashIntensity', label: 'Dash Intensity', type: 'number', min: 0, max: 100, category: 'line', categoryLabel: 'Line' },
  { property: 'smoothing', label: 'Smoothing', type: 'number', min: 0, max: 1, step: 0.01, category: 'line', categoryLabel: 'Line' },
];

export const PROPERTY_REGISTRY: Map<ElementKind, KeyframeableProperty[]> = new Map([
  ['shape', [
    ...TRANSFORM_PROPS,
    ...FILL_PROPS,
    ...STROKE_PROPS,
    ...SHADOW_PROPS,
    ...SHAPE_SPECIFIC_PROPS,
  ]],
  ['text', [
    ...TRANSFORM_PROPS,
    ...FILL_PROPS,
    ...STROKE_PROPS,
    ...SHADOW_PROPS,
    ...TEXT_PROPS,
  ]],
  ['image', [
    ...TRANSFORM_PROPS,
    ...IMAGE_COLOR_PROPS,
    ...IMAGE_FILTER_PROPS,
    ...SHADOW_PROPS,
  ]],
  ['video', [
    ...TRANSFORM_PROPS,
    ...SHADOW_PROPS,
    { property: 'filters.brightness', label: 'Brightness', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
    { property: 'filters.contrast', label: 'Contrast', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
    { property: 'filters.saturation', label: 'Saturation', type: 'number', min: -100, max: 100, category: 'color', categoryLabel: 'Color' },
  ]],
['line', [
    ...TRANSFORM_PROPS,
    ...LINE_SPECIFIC_PROPS,
    ...SHADOW_PROPS,
  ]],
  ['gradient', [
    ...TRANSFORM_PROPS,
    ...FILL_PROPS,
    ...GRADIENT_PROPS,
  ]],
  ['group', [
    ...TRANSFORM_PROPS,
  ]],
]);

export function getPropertiesForElement(element: DesignElement): KeyframeableProperty[] {
  const kind = getElementKind(element);
  const base = PROPERTY_REGISTRY.get(kind) ?? [...TRANSFORM_PROPS];
  const extra: KeyframeableProperty[] = [];

  if (element.gradientEnabled && element.gradientColors) {
    element.gradientColors.forEach((stop, i) => {
      extra.push({
        property: `gradientColor-${stop.id}`,
        label: `Gradient Stop ${i + 1}`,
        type: 'color',
        category: 'fill',
        categoryLabel: 'Fill',
      });
      extra.push({
        property: `gradientPos-${stop.id}`,
        label: `Stop ${i + 1} Position`,
        type: 'percentage',
        min: 0, max: 100, unit: '%',
        category: 'fill',
        categoryLabel: 'Fill',
      });
    });
  }

  return [...base, ...extra];
}

export function getCategoriesForElement(element: DesignElement): Array<{ id: string; label: string }> {
  const props = getPropertiesForElement(element);
  const seen = new Set<string>();
  const cats: Array<{ id: string; label: string }> = [];
  for (const p of props) {
    if (!seen.has(p.category)) {
      seen.add(p.category);
      cats.push({ id: p.category, label: p.categoryLabel });
    }
  }
  return cats;
}

export function getPropertyValueFromElement(
  property: string,
  element: DesignElement
): number | string {
  if (property.startsWith('gradientColor-')) {
    const id = property.replace('gradientColor-', '');
    const stop = element.gradientColors?.find(s => s.id === id);
    return stop?.color ?? '#000000';
  }
  if (property.startsWith('gradientPos-')) {
    const id = property.replace('gradientPos-', '');
    const stop = element.gradientColors?.find(s => s.id === id);
    return stop?.position ?? 0;
  }

  if (property.startsWith('filters.')) {
    const key = property.replace('filters.', '') as keyof NonNullable<DesignElement['filters']>;
    const val = element.filters?.[key];
    return typeof val === 'number' ? val : 0;
  }

  if (property.startsWith('threeDSceneState.')) {
    return 0;
  }

  if (property.startsWith('uvTransform.')) {
    const key = property.replace('uvTransform.', '');
    const val = (element as any).advancedTextureSettings?.uvTransform?.[key];
    if (typeof val === 'number') return val;
    const defaults: Record<string, number> = {
      offsetX: 0, offsetY: 0, repeatX: 1, repeatY: 1, rotation: 0, centerX: 0.5, centerY: 0.5,
    };
    return defaults[key] ?? 0;
  }

  switch (property) {
    case 'x': return element.x;
    case 'y': return element.y;
    case 'width': return element.width;
    case 'height': return element.height;
    case 'rotation': return element.rotation;
    case 'opacity': return element.opacity;
    case 'scaleX': return 1;
    case 'scaleY': return 1;
    case 'fill': return element.fill;
    case 'stroke': return element.stroke;
    case 'strokeWidth': return element.strokeWidth;
    case 'borderRadius': return element.borderRadius;
    case 'shadowBlur': return element.shadow?.blur ?? 0;
    case 'shadowX': return element.shadow?.x ?? 0;
    case 'shadowY': return element.shadow?.y ?? 0;
    case 'gradientAngle': return element.gradientAngle ?? 0;
    case 'gradientCenterX': return element.gradientCenterX ?? 50;
    case 'gradientCenterY': return element.gradientCenterY ?? 50;
    case 'shapePatternOpacity': return element.shapePatternOpacity ?? 1;
    case 'shapePatternSize': return element.shapePatternSize ?? 10;
    case 'shapePatternSpacing': return element.shapePatternSpacing ?? 5;
    case 'shapePatternAngle': return element.shapePatternAngle ?? 0;
    case 'fontSize': return element.fontSize ?? 16;
    case 'letterSpacing': return element.letterSpacing ?? 0;
    case 'lineHeight': return element.lineHeight ?? 1.4;
    case 'wordSpacing': return element.wordSpacing ?? 0;
    case 'textColor': return element.textColor ?? '#ffffff';
    case 'textStrokeWidth': return element.textStrokeWidth ?? 0;
    case 'textStrokeColor': return element.textStrokeColor ?? '#000000';
    case 'textShadowBlur': return element.textShadowBlur ?? 0;
    case 'textShadowOffsetX': return element.textShadowOffsetX ?? 0;
    case 'textShadowOffsetY': return element.textShadowOffsetY ?? 0;
    case 'textGlowSize': return element.textGlowSize ?? 0;
    case 'textGlowIntensity': return element.textGlowIntensity ?? 0;
    case 'textGradientAngle': return element.textGradientAngle ?? 0;
    case 'textTextureFillScale': return element.textTextureFillScale ?? 1;
    case 'textTextureFillOffsetX': return element.textTextureFillOffsetX ?? 0;
    case 'textTextureFillOffsetY': return element.textTextureFillOffsetY ?? 0;
    case 'textPatternSize': return element.textPatternSize ?? 10;
    case 'textPatternSpacing': return element.textPatternSpacing ?? 5;
    case 'textPatternAngle': return element.textPatternAngle ?? 0;
    case 'baselineShift': return element.baselineShift ?? 0;
    case 'textIndent': return element.textIndent ?? 0;
    case 'textPaddingTop': return element.textPaddingTop ?? 0;
    case 'textPaddingRight': return element.textPaddingRight ?? 0;
    case 'textPaddingBottom': return element.textPaddingBottom ?? 0;
    case 'textPaddingLeft': return element.textPaddingLeft ?? 0;
    case 'stagger': return element.stagger ?? 0;
    case 'starPoints': return element.starPoints ?? 5;
    case 'starInnerRadius': return element.starInnerRadius ?? 0.5;
    case 'arrowheadSize': return element.arrowheadSize ?? 10;
    case 'smoothing': return element.smoothing ?? 0;
    case 'trimStart': return element.trimStart ?? 0;
    case 'trimEnd': return element.trimEnd ?? 100;
    case 'dashIntensity': return element.dashIntensity ?? 0;
    default: return 0;
  }
}

export function isColorPropertyPath(property: string): boolean {
  if (property === 'fill' || property === 'stroke') return true;
  if (property.startsWith('gradientColor-')) return true;
  if (property === 'textColor' || property === 'textStrokeColor') return true;
  if (
    property === 'threeDSceneState.material.color' ||
    property === 'threeDSceneState.material.emissive' ||
    property === 'threeDSceneState.material.sheenColor' ||
    property === 'threeDSceneState.scene.backgroundColor' ||
    property === 'threeDSceneState.scene.fogColor' ||
    property.match(/^threeDSceneState\.light\.\d+\.color$/) ||
    property.match(/^threeDSceneState\.lighting\./) && property.endsWith('Color')
  ) return true;
  return false;
}
