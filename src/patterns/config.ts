import type { PatternConfig, PatternType } from './types';
import { PATTERN_TYPES } from './types';
import { DEFAULT_PATTERN } from './presets';

const TYPES: PatternType[] = PATTERN_TYPES;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
type BlobKey = 'blobCount' | 'seed' | 'floor' | 'lumps' | 'softness' | 'billow';
const optNum = (k: BlobKey, v: unknown): Partial<Pick<PatternConfig, BlobKey>> => (typeof v === 'number' && Number.isFinite(v) ? { [k]: v } : {});

/** Parse a stored configJSON into a complete, defaulted PatternConfig (lenient - never throws). */
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
    // B58 blob fields: kept only when present (finite numbers), so other configs serialize unchanged.
    ...optNum('blobCount', raw.blobCount),
    ...optNum('seed', raw.seed),
    ...optNum('floor', raw.floor),
    ...optNum('lumps', raw.lumps),
    ...optNum('softness', raw.softness),
    ...optNum('billow', raw.billow),
  };
}

export function serializePatternConfig(cfg: PatternConfig): string {
  return JSON.stringify(cfg);
}
