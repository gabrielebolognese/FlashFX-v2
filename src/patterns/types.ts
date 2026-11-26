// Procedural pattern engine - config schema. A generativePattern layer carries this as JSON. The
// pure field math (patterns.ts) is shared by the current CPU renderer and the future GPU shader, so
// the two never drift. Frame-pure: everything is a function of (uv, time, params) only.

export type PatternType =
  | 'waves' | 'plasma' | 'kaleidoscope' | 'mosaic'
  | 'clouds' | 'voronoi' | 'rings' | 'spiral' | 'interference' | 'gradient' | 'warp'
  | 'blobField';

export interface PatternStop {
  color: [number, number, number]; // rgb 0..1
  pos: number;                      // 0..1
}

export interface PatternConfig {
  type: PatternType;
  scale: number;         // spatial frequency
  speed: number;         // time multiplier
  rotationDeg: number;
  complexity: number;    // wave count / fbm octaves / kaleidoscope mirror count
  warp: number;          // domain-warp amount
  contrast: number;      // 0 = flat, >0 punchier
  paletteMode: 'linear' | 'smooth';
  palette: PatternStop[];
  // B58 'blobField' only (patterns/blobField.ts). Optional: absent = BLOB_DEFAULTS, ignored by every
  // other type, and never written for configs that did not have them (old projects round-trip as-is).
  /** Number of blobs, 1..16 (field mode). */
  blobCount?: number;
  /** Integer seed of the blob layout / edge noise. */
  seed?: number;
  /** 0 = full-frame mesh-gradient field; 0..1 = cloud-floor mode, top edge at this fraction of the height from the bottom. */
  floor?: number;
  /** Floor edge lumpiness (fraction of the layer height). */
  lumps?: number;
  /** Blob blend softness (field) / edge feather (floor), 0.05..4, default 1. */
  softness?: number;
  /** Floor: billow noise mixed into the colour ramp (0..2). */
  billow?: number;
}

export const PATTERN_TYPES: PatternType[] = [
  'waves', 'plasma', 'kaleidoscope', 'mosaic',
  'clouds', 'voronoi', 'rings', 'spiral', 'interference', 'gradient', 'warp',
  'blobField',
];

// Frozen numeric ids - mirror these in the GPU shader's `switch(patternType)` so TS and WGSL can't
// drift (same discipline as core/effects/effectRegistry EFFECT_TYPE).
export const PATTERN_TYPE: Record<PatternType, number> = {
  waves: 0, plasma: 1, kaleidoscope: 2, mosaic: 3,
  clouds: 4, voronoi: 5, rings: 6, spiral: 7, interference: 8, gradient: 9, warp: 10,
  blobField: 11,
};
