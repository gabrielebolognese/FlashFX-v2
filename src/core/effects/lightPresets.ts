import { EFFECT_TYPE } from './effectRegistry';
import type { LayerEffect } from '../types';
import type { StylizePreset } from './stylizePresets';

// Light rays, flares & beams (B16) - built-in light looks. Every referenced effect already exists in
// the registry with a working IMAGE_SHADER case (lightRays 290, sunRays 291, lightWrap 292, lensFlare
// 293, specularHighlight 294), so these presets render now. Reuses the B13 preset type + apply.
// Validated (verify:light-presets). The Saber-like beam/lightning generator is separate (beamGeometry
// + B16-gpu).

const fx = (type: number, ...params: number[]): LayerEffect => ({ type, enabled: true, params });

export const LIGHT_PRESETS: StylizePreset[] = [
  { name: 'sun-flare', label: 'Sun Flare', effects: [fx(EFFECT_TYPE.lensFlare, 0.6), fx(EFFECT_TYPE.lightRays, 0.4)] },
  { name: 'god-rays', label: 'God Rays', effects: [fx(EFFECT_TYPE.sunRays, 0.6), fx(EFFECT_TYPE.lightRays, 0.5)] },
  { name: 'lens-flare', label: 'Lens Flare', effects: [fx(EFFECT_TYPE.lensFlare, 0.75)] },
  { name: 'dreamy', label: 'Dreamy Light', effects: [fx(EFFECT_TYPE.lightWrap, 0.5), fx(EFFECT_TYPE.lightRays, 0.3), fx(EFFECT_TYPE.lensFlare, 0.3)] },
  { name: 'hero-glint', label: 'Hero Glint', effects: [fx(EFFECT_TYPE.specularHighlight, 0.6), fx(EFFECT_TYPE.lensFlare, 0.4)] },
  { name: 'volumetric', label: 'Volumetric', effects: [fx(EFFECT_TYPE.sunRays, 0.7), fx(EFFECT_TYPE.lightWrap, 0.4)] },
];
