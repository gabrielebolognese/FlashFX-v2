import { EFFECT_TYPE } from './effectRegistry';
import type { LayerEffect } from '../types';
import type { StylizePreset } from './stylizePresets';

// Glitch & datamosh (B14) - built-in glitch looks. Every referenced effect already exists in the
// registry with a frame-pure IMAGE_SHADER case (seeded by the effectTime uniform, so the timeline
// scrubs byte-identically): rgbSplit (240), channelOffset (241), digitalGlitch (245), vhs (246) +
// vhsNoise (247), scanlineNoise (250), blockPixelation, wave, add/gaussian noise. So the batch is
// curation, not new shaders. Reuses the B13 preset type + apply. Validated (verify:glitch-presets).
// The genuinely-missing effects (pixel-sort, true datamosh block displacement) are B14-gpu.

const fx = (type: number, ...params: number[]): LayerEffect => ({ type, enabled: true, params });

export const GLITCH_PRESETS: StylizePreset[] = [
  {
    name: 'rgb-split', label: 'RGB Split',
    effects: [fx(EFFECT_TYPE.rgbSplit, 0.5), fx(EFFECT_TYPE.channelOffset, 0.3)],
  },
  {
    name: 'datamosh', label: 'Datamosh',
    effects: [fx(EFFECT_TYPE.blockPixelation, 0.6), fx(EFFECT_TYPE.digitalGlitch, 0.5), fx(EFFECT_TYPE.rgbSplit, 0.3)],
  },
  {
    name: 'signal-loss', label: 'Signal Loss',
    effects: [fx(EFFECT_TYPE.vhs, 0.6), fx(EFFECT_TYPE.vhsNoise, 0.5), fx(EFFECT_TYPE.scanlineNoise, 0.4), fx(EFFECT_TYPE.rgbSplit, 0.3)],
  },
  {
    name: 'digital-decay', label: 'Digital Decay',
    effects: [fx(EFFECT_TYPE.digitalGlitch, 0.7), fx(EFFECT_TYPE.addNoise, 0.3), fx(EFFECT_TYPE.channelOffset, 0.4)],
  },
  {
    name: 'broken-signal', label: 'Broken Signal',
    effects: [fx(EFFECT_TYPE.scanlineNoise, 0.6), fx(EFFECT_TYPE.gaussianNoise, 0.4), fx(EFFECT_TYPE.rgbSplit, 0.5)],
  },
  {
    name: 'corrupt', label: 'Corrupt',
    effects: [fx(EFFECT_TYPE.blockPixelation, 0.8), fx(EFFECT_TYPE.digitalGlitch, 0.6)],
  },
  {
    name: 'wave-glitch', label: 'Wave Glitch',
    effects: [fx(EFFECT_TYPE.wave, 0.4), fx(EFFECT_TYPE.rgbSplit, 0.3), fx(EFFECT_TYPE.digitalGlitch, 0.3)],
  },
];
