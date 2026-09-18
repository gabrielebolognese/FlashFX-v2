import type { LayerEffect } from '../types';
import { EFFECT_TYPE } from './effectRegistry';

// Stylise & cinematic finish (B13) - built-in effect-stack presets. Every effect referenced here
// already exists in the effect registry with a working IMAGE_SHADER case (chromatic aberration, lens
// distortion, film grain, halftone, scanlines, posterize, cartoon/cel, VHS/CRT), so applying a preset
// composes real, rendering-now looks - no new shader work. Pure data + a clone helper; validated
// against the registry (verify:stylize-presets). Apply via editor `setLayerEffects`.

export interface StylizePreset {
  name: string;
  label: string;
  effects: LayerEffect[];
}

const fx = (type: number, ...params: number[]): LayerEffect => ({ type, enabled: true, params });

export const STYLIZE_PRESETS: StylizePreset[] = [
  {
    name: 'cinematic', label: 'Cinematic',
    effects: [fx(EFFECT_TYPE.chromaticAberration, 0.25), fx(EFFECT_TYPE.filmGrain, 0.15)],
  },
  {
    name: 'film', label: 'Film',
    effects: [fx(EFFECT_TYPE.filmGrain, 0.35), fx(EFFECT_TYPE.chromaticAberration, 0.12), fx(EFFECT_TYPE.posterize, 16)],
  },
  {
    name: 'vhs', label: 'VHS',
    effects: [fx(EFFECT_TYPE.vhs, 0.5), fx(EFFECT_TYPE.scanlines, 0.4), fx(EFFECT_TYPE.chromaticAberration, 0.3), fx(EFFECT_TYPE.filmGrain, 0.2)],
  },
  {
    name: 'crt', label: 'CRT',
    effects: [fx(EFFECT_TYPE.crtMonitor, 0.6), fx(EFFECT_TYPE.scanlines, 0.5), fx(EFFECT_TYPE.chromaticAberration, 0.2)],
  },
  {
    name: 'comic', label: 'Comic',
    effects: [fx(EFFECT_TYPE.cartoon, 0.7), fx(EFFECT_TYPE.halftone, 0.5), fx(EFFECT_TYPE.posterize, 6)],
  },
  {
    name: 'retro', label: 'Retro',
    effects: [fx(EFFECT_TYPE.posterize, 5), fx(EFFECT_TYPE.dots, 0.4), fx(EFFECT_TYPE.scanlines, 0.3)],
  },
  {
    name: 'dream', label: 'Dream',
    effects: [fx(EFFECT_TYPE.chromaticAberration, 0.4), fx(EFFECT_TYPE.filmGrain, 0.1)],
  },
  {
    name: 'lens', label: 'Lens',
    effects: [fx(EFFECT_TYPE.lensDistortion, 0.35), fx(EFFECT_TYPE.chromaticAberration, 0.2)],
  },
];

/** A fresh, deep-cloned effect stack for a preset (safe to hand to setLayerEffects). */
export function applyStylizePreset(preset: StylizePreset): LayerEffect[] {
  return preset.effects.map((e) => ({ type: e.type, enabled: e.enabled !== false, params: e.params.slice() }));
}
