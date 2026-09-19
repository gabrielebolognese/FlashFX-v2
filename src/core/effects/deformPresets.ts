import { EFFECT_TYPE } from './effectRegistry';
import type { LayerEffect } from '../types';
import type { StylizePreset } from './stylizePresets';

// Deformation & warp (B24) - built-in deform looks over the existing warp effects (bulge, pinch,
// twirl, wave, ripple, turbulentDisplace - all render via applyWarpEffect), so these apply now.
// Reuses the B13 preset type + apply. Validated (verify:deform). Puppet mesh warp is separate
// (core/warp/puppet.ts + B24-render).

const fx = (type: number, ...params: number[]): LayerEffect => ({ type, enabled: true, params });

export const DEFORM_PRESETS: StylizePreset[] = [
  { name: 'jelly', label: 'Jelly', effects: [fx(EFFECT_TYPE.turbulentDisplace, 0.4), fx(EFFECT_TYPE.wave, 0.2)] },
  { name: 'flag', label: 'Flag Wave', effects: [fx(EFFECT_TYPE.wave, 0.5)] },
  { name: 'ripple', label: 'Ripple', effects: [fx(EFFECT_TYPE.ripple, 0.5)] },
  { name: 'wobble', label: 'Wobble', effects: [fx(EFFECT_TYPE.wave, 0.3), fx(EFFECT_TYPE.twirl, 0.15)] },
  { name: 'melt', label: 'Melt', effects: [fx(EFFECT_TYPE.turbulentDisplace, 0.6)] },
  { name: 'bulge', label: 'Bulge', effects: [fx(EFFECT_TYPE.bulge, 0.5)] },
  { name: 'pinch', label: 'Pinch', effects: [fx(EFFECT_TYPE.pinch, 0.5)] },
  { name: 'vortex', label: 'Vortex', effects: [fx(EFFECT_TYPE.twirl, 0.6), fx(EFFECT_TYPE.ripple, 0.2)] },
];
