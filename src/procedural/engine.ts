import type {
  ProceduralBinding,
  ProceduralOutput,
  ProceduralTransformResult,
  ProceduralInstanceResult,
  ProceduralTileResult,
  TransformLoopParams,
  GridArrayParams,
  PhaseOffsetMode,
  EasingMode,
} from './types';
import type { ProceduralBinding as CoreBinding } from '../core/types';

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandom(seed: number): number {
  const rng = mulberry32(seed);
  return rng();
}

function applyEasing(t: number, easing: EasingMode): number {
  switch (easing) {
    case 'linear': return t;
    case 'sine': return Math.sin(t * Math.PI * 2);
    case 'cosine': return Math.cos(t * Math.PI * 2);
  }
}

function evaluateTransformParam(t: number, param: TransformLoopParams): number {
  const phase = t * param.cycles * param.direction;
  const wave = applyEasing(phase, param.easing);
  return param.offset + param.amplitude * wave;
}

function buildTransformResult(t: number, params: TransformLoopParams[]): ProceduralTransformResult {
  const result: ProceduralTransformResult = {
    x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
  };
  for (const param of params) {
    const value = evaluateTransformParam(t, param);
    switch (param.property) {
      case 'rotation': result.rotation += value; break;
      case 'scaleX': result.scaleX *= (1 + value); break;
      case 'scaleY': result.scaleY *= (1 + value); break;
      case 'scale': result.scaleX *= (1 + value); result.scaleY *= (1 + value); break;
      case 'positionX': result.x += value; break;
      case 'positionY': result.y += value; break;
      case 'opacity': result.opacity *= Math.max(0, Math.min(1, 1 + value)); break;
    }
  }
  return result;
}

function computeInstancePhase(
  row: number, col: number, rows: number, cols: number,
  mode: PhaseOffsetMode, spread: number,
): number {
  switch (mode) {
    case 'diagonal': {
      const maxDiag = rows + cols - 2;
      return maxDiag > 0 ? ((row + col) / maxDiag) * spread : 0;
    }
    case 'radial': {
      const cx = (cols - 1) / 2;
      const cy = (rows - 1) / 2;
      const maxDist = Math.hypot(cx, cy) || 1;
      return (Math.hypot(col - cx, row - cy) / maxDist) * spread;
    }
    case 'horizontal': {
      return cols > 1 ? (col / (cols - 1)) * spread : 0;
    }
    case 'vertical': {
      return rows > 1 ? (row / (rows - 1)) * spread : 0;
    }
    case 'random': {
      return seededRandom(row * 9973 + col * 7919) * spread;
    }
  }
}

function evaluateGridArray(t: number, grid: GridArrayParams): ProceduralInstanceResult {
  const instances: ProceduralTransformResult[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const phase = computeInstancePhase(row, col, grid.rows, grid.cols, grid.phaseOffsetMode, grid.phaseSpread);
      const localT = ((t + phase) % 1 + 1) % 1;
      const transform = buildTransformResult(localT, grid.baseTransforms);
      transform.x += col * (grid.cellWidth + grid.spacingX);
      transform.y += row * (grid.cellHeight + grid.spacingY);
      instances.push(transform);
    }
  }
  return {
    instances,
    gridCols: grid.cols,
    gridRows: grid.rows,
    cellWidth: grid.cellWidth,
    cellHeight: grid.cellHeight,
  };
}

function evaluateTileScroll(t: number, params: { scrollX: number; scrollY: number; tileWidth: number; tileHeight: number }): ProceduralTileResult {
  return {
    offsetU: ((t * params.scrollX) % 1 + 1) % 1,
    offsetV: ((t * params.scrollY) % 1 + 1) % 1,
    tileWidth: params.tileWidth,
    tileHeight: params.tileHeight,
  };
}

export function evaluateBinding(binding: ProceduralBinding | CoreBinding, frame: number): ProceduralOutput | null {
  if (!binding.enabled) return null;

  const loopFrames = binding.loopDurationFrames;
  if (loopFrames <= 0) return null;

  let rawT = ((frame % loopFrames) / loopFrames) * binding.speedMultiplier;
  if (binding.pingPong) {
    rawT = rawT * 2;
    if (rawT > 1) rawT = 2 - rawT;
    rawT = Math.sin(rawT * Math.PI / 2);
  } else {
    rawT = ((rawT % 1) + 1) % 1;
  }

  switch (binding.loopType) {
    case 'transform': {
      if (!binding.transformParams?.length) return null;
      return { kind: 'transform', result: buildTransformResult(rawT, binding.transformParams) };
    }
    case 'gridArray': {
      if (!binding.gridParams) return null;
      return { kind: 'gridArray', result: evaluateGridArray(rawT, binding.gridParams) };
    }
    case 'tileScroll': {
      if (!binding.tileParams) return null;
      return { kind: 'tileScroll', result: evaluateTileScroll(rawT, binding.tileParams) };
    }
  }
}

export function getDefaultTransformResult(): ProceduralTransformResult {
  return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 };
}
