import type { PatternConfig, PatternType } from './types';
import { DEFAULT_PATTERN } from './presets';

const TYPES: PatternType[] = ['waves', 'plasma', 'kaleidoscope', 'mosaic'];
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Parse a stored configJSON into a complete, defaulted PatternConfig (lenient — never throws). */
export function parsePatternConfig(json: string): PatternConfig {
  let raw: Partial<PatternConfig> = {};
  try { const p = JSON.parse(json); if (p && typeof p === 'object') raw = p; } catch { /* defaults */ }
  const d = DEFAULT_PATTERN;
  return {
    type: TYPES.includes(raw.type as PatternType) ? (raw.type as PatternType) : d.type,
    scale: num(raw.scale, d.scale),
    speed: num(raw.speed, d.speed),
    rotationDeg: num(raw.rotationDeg, d.rotationDeg),
    complexity: num(raw.complexity, d.complexity),
    warp: num(raw.warp, d.warp),
    contrast: num(raw.contrast, d.contrast),
    paletteMode: raw.paletteMode === 'linear' ? 'linear' : 'smooth',
    palette: Array.isArray(raw.palette) && raw.palette.length >= 2 ? raw.palette : d.palette,
  };
}

export function serializePatternConfig(cfg: PatternConfig): string {
  return JSON.stringify(cfg);
}
