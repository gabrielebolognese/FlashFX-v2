import type { Layer, LayerShadow, LayerGlow, LayerBlur, Vec4 } from './types';

// Default parameters applied when a layer effect is first enabled - used by BOTH
// the Inspector's Effects section and the top-bar Effects menu, so the two entry
// points enable identical effects. Single source of truth.

export const DEFAULT_SHADOW: LayerShadow = {
  enabled: true,
  onlyShadow: false,
  color: [0, 0, 0, 0.55],
  lightAngle: 90,
  lightDistance: 40,
  shadowScale: 1,
  blurRadius: 8,
};

export const DEFAULT_GLOW: LayerGlow = {
  enabled: true,
  mode: 'image',
  onlyGlow: false,
  color: [1, 1, 1, 1],
  intensity: 1,
  radius: 12,
  threshold: 0.6,
};

/**
 * B67 - the glow a layer gets when it is first switched on. Text and shape layers glow in their own
 * colour from every pixel (threshold 0): the generic white glow at threshold 0.6 extracts only bright
 * luminance, so it vanishes on saturated text (a #00c853 green word has luminance ~0.5). Other layers
 * (images, video, precomps) keep the bloom-style DEFAULT_GLOW.
 */
export function defaultGlowFor(layer: Layer | undefined): LayerGlow {
  let color: Vec4 | undefined;
  if (layer?.type === 'text') color = layer.content.spans[0]?.style.color;
  else if (layer?.type === 'shape') color = layer.shape.fillColor[3] > 0 ? layer.shape.fillColor : layer.shape.strokeColor;
  if (!color) return { ...DEFAULT_GLOW };
  return { ...DEFAULT_GLOW, color: [color[0], color[1], color[2], 1], threshold: 0 };
}

export const DEFAULT_BLUR: LayerBlur = {
  enabled: true,
  type: 'gaussian',
  radius: 10,
  angle: 0,
  centerX: 0.5,
  centerY: 0.5,
  strength: 20,
  passes: 4,
};
