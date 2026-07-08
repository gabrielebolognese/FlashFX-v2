export type FieldType = 'glyph' | 'noise' | 'path' | 'composite';

export interface GlyphFieldDef {
  type: 'glyph';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  resolution: number;
}

export type NoiseType = 'simplex' | 'perlin' | 'worley';

export interface NoiseFieldDef {
  type: 'noise';
  noiseType: NoiseType;
  scale: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
  threshold: number;
  timeSpeed: number;
  seed: number;
}

export interface PathFieldDef {
  type: 'path';
  points: [number, number][];
  closed: boolean;
  smoothing: number;
}

export type CompositeOp = 'union' | 'intersect' | 'subtract' | 'multiply';

export interface CompositeFieldDef {
  type: 'composite';
  op: CompositeOp;
  fields: FieldDefinition[];
}

export type FieldDefinition = GlyphFieldDef | NoiseFieldDef | PathFieldDef | CompositeFieldDef;

export type SamplerType = 'grid' | 'scanline' | 'offsetBundle';

export interface GridSamplerDef {
  type: 'grid';
  cellSize: number;
  jitter: number;
  dotSizeMin: number;
  dotSizeMax: number;
  threshold: number;
}

export interface ScanlineSamplerDef {
  type: 'scanline';
  direction: 'horizontal' | 'vertical';
  lineSpacing: number;
  dashMinLength: number;
  dashMaxLength: number;
  gapChance: number;
  noiseBreak: boolean;
  noiseBreakScale: number;
  threshold: number;
}

export interface OffsetBundleSamplerDef {
  type: 'offsetBundle';
  copyCount: number;
  offsetSpacing: number;
  opacityFalloff: 'linear' | 'easeOut' | 'gaussian';
  strokeWidth: number;
  phaseOffset: number;
}

export type SamplerDefinition = GridSamplerDef | ScanlineSamplerDef | OffsetBundleSamplerDef;

export type MarkShape = 'dash' | 'dot' | 'line';

export interface MarkStyle {
  color: [number, number, number, number];
  shape: MarkShape;
  sizeMin: number;
  sizeMax: number;
  strokeWidth: number;
  roundCaps: boolean;
}

export interface FieldAnimationDef {
  rotationSpeed: number;
  morphSpeed: number;
  noiseEvolution: number;
  breatheAmplitude: number;
  breatheSpeed: number;
}

export interface FieldSampledConfig {
  field: FieldDefinition;
  sampler: SamplerDefinition;
  mark: MarkStyle;
  animation: FieldAnimationDef;
  canvasWidth: number;
  canvasHeight: number;
}

export interface FieldSample {
  x: number;
  y: number;
  value: number;
  angle: number;
  length: number;
}

export const DEFAULT_MARK_STYLE: MarkStyle = {
  color: [1, 1, 1, 1],
  shape: 'dot',
  sizeMin: 1,
  sizeMax: 8,
  strokeWidth: 1.5,
  roundCaps: true,
};

export const DEFAULT_ANIMATION: FieldAnimationDef = {
  rotationSpeed: 0,
  morphSpeed: 0,
  noiseEvolution: 0.5,
  breatheAmplitude: 0,
  breatheSpeed: 1,
};

export const DEFAULT_GRID_SAMPLER: GridSamplerDef = {
  type: 'grid',
  cellSize: 8,
  jitter: 0,
  dotSizeMin: 1,
  dotSizeMax: 6,
  threshold: 0.1,
};

export const DEFAULT_SCANLINE_SAMPLER: ScanlineSamplerDef = {
  type: 'scanline',
  direction: 'horizontal',
  lineSpacing: 4,
  dashMinLength: 2,
  dashMaxLength: 40,
  gapChance: 0.15,
  noiseBreak: true,
  noiseBreakScale: 0.05,
  threshold: 0.3,
};

export const DEFAULT_OFFSET_BUNDLE_SAMPLER: OffsetBundleSamplerDef = {
  type: 'offsetBundle',
  copyCount: 30,
  offsetSpacing: 3,
  opacityFalloff: 'gaussian',
  strokeWidth: 1,
  phaseOffset: 0.02,
};

export const DEFAULT_GLYPH_FIELD: GlyphFieldDef = {
  type: 'glyph',
  text: '?',
  fontFamily: 'Inter',
  fontSize: 400,
  fontWeight: 700,
  resolution: 1,
};

export const DEFAULT_NOISE_FIELD: NoiseFieldDef = {
  type: 'noise',
  noiseType: 'simplex',
  scale: 0.01,
  octaves: 4,
  lacunarity: 2,
  persistence: 0.5,
  threshold: 0.4,
  timeSpeed: 0.5,
  seed: 42,
};

export const DEFAULT_FIELD_SAMPLED_CONFIG: FieldSampledConfig = {
  field: DEFAULT_GLYPH_FIELD,
  sampler: DEFAULT_GRID_SAMPLER,
  mark: DEFAULT_MARK_STYLE,
  animation: DEFAULT_ANIMATION,
  canvasWidth: 600,
  canvasHeight: 800,
};
