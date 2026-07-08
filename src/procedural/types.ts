export type LoopPrimitive = 'transform' | 'gridArray' | 'tileScroll';

export type PhaseOffsetMode = 'diagonal' | 'radial' | 'horizontal' | 'vertical' | 'random';
export type TransformProperty = 'rotation' | 'scaleX' | 'scaleY' | 'scale' | 'positionX' | 'positionY' | 'opacity';
export type EasingMode = 'linear' | 'sine' | 'cosine';

export interface TransformLoopParams {
  property: TransformProperty;
  cycles: number;
  amplitude: number;
  offset: number;
  easing: EasingMode;
  direction: 1 | -1;
}

export interface GridArrayParams {
  rows: number;
  cols: number;
  cellWidth: number;
  cellHeight: number;
  spacingX: number;
  spacingY: number;
  phaseOffsetMode: PhaseOffsetMode;
  phaseSpread: number;
  baseTransforms: TransformLoopParams[];
}

export interface TileScrollParams {
  scrollX: number;
  scrollY: number;
  tileWidth: number;
  tileHeight: number;
}

export interface ProceduralBinding {
  id: string;
  layerId: string;
  enabled: boolean;
  loopType: LoopPrimitive;
  loopDurationFrames: number;
  speedMultiplier: number;
  pingPong: boolean;
  transformParams?: TransformLoopParams[];
  gridParams?: GridArrayParams;
  tileParams?: TileScrollParams;
}

export interface ProceduralTransformResult {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

export interface ProceduralInstanceResult {
  instances: ProceduralTransformResult[];
  gridCols: number;
  gridRows: number;
  cellWidth: number;
  cellHeight: number;
}

export interface ProceduralTileResult {
  offsetU: number;
  offsetV: number;
  tileWidth: number;
  tileHeight: number;
}

export type ProceduralOutput =
  | { kind: 'transform'; result: ProceduralTransformResult }
  | { kind: 'gridArray'; result: ProceduralInstanceResult }
  | { kind: 'tileScroll'; result: ProceduralTileResult };
