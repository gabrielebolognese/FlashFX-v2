import type { PatternConfig, PatternStop } from './types';

const ramp = (colors: [number, number, number][]): PatternStop[] =>
  colors.map((color, i) => ({ color, pos: i / (colors.length - 1) }));

export const PALETTES: Record<string, PatternStop[]> = {
  Ocean: ramp([[0.02, 0.1, 0.25], [0.05, 0.32, 0.55], [0.2, 0.62, 0.82], [0.75, 0.92, 0.96]]),
  Sunset: ramp([[0.09, 0.05, 0.2], [0.6, 0.15, 0.32], [0.96, 0.5, 0.2], [1, 0.9, 0.5]]),
  Neon: ramp([[0.04, 0, 0.15], [0.5, 0, 0.8], [0, 0.8, 0.9], [0.9, 1, 0.4]]),
  Aurora: ramp([[0.02, 0.05, 0.1], [0.1, 0.5, 0.4], [0.3, 0.9, 0.6], [0.7, 0.5, 0.9]]),
  Mono: ramp([[0.05, 0.05, 0.08], [0.5, 0.52, 0.58], [0.96, 0.97, 1]]),
};

export const DEFAULT_PATTERN: PatternConfig = {
  type: 'plasma', scale: 1, speed: 0.8, rotationDeg: 0, complexity: 4, warp: 0.2, contrast: 0.2,
  paletteMode: 'smooth', palette: PALETTES.Neon,
};

export interface PatternPreset { name: string; config: PatternConfig }
export const PATTERN_PRESETS: PatternPreset[] = [
  { name: 'Ocean Waves', config: { type: 'waves', scale: 1, speed: 0.6, rotationDeg: 0, complexity: 4, warp: 0.15, contrast: 0.3, paletteMode: 'smooth', palette: PALETTES.Ocean } },
  { name: 'Neon Plasma', config: { type: 'plasma', scale: 1.2, speed: 0.9, rotationDeg: 0, complexity: 4, warp: 0.3, contrast: 0.25, paletteMode: 'smooth', palette: PALETTES.Neon } },
  { name: 'Kaleido Bloom', config: { type: 'kaleidoscope', scale: 1, speed: 0.4, rotationDeg: 0, complexity: 6, warp: 0.1, contrast: 0.4, paletteMode: 'smooth', palette: PALETTES.Aurora } },
  { name: 'Hex Mosaic', config: { type: 'mosaic', scale: 1.4, speed: 0.5, rotationDeg: 0, complexity: 1, warp: 0, contrast: 0.5, paletteMode: 'linear', palette: PALETTES.Sunset } },
  { name: 'Sunset Waves', config: { type: 'waves', scale: 0.8, speed: 0.5, rotationDeg: 20, complexity: 3, warp: 0.4, contrast: 0.35, paletteMode: 'smooth', palette: PALETTES.Sunset } },
];
