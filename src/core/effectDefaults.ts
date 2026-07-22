import type { LayerShadow, LayerGlow, LayerBlur } from './types';

// Default parameters applied when a layer effect is first enabled — used by BOTH
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
