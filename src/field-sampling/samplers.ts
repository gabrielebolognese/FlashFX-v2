import type { FieldGrid } from './fields';
import type {
  SamplerDefinition,
  GridSamplerDef,
  ScanlineSamplerDef,
  OffsetBundleSamplerDef,
  FieldSample,
  PathFieldDef,
} from './types';
import { sampleFieldBilinear } from './fields';

export function generateSamples(
  grid: FieldGrid,
  sampler: SamplerDefinition,
  time: number,
  pathDef?: PathFieldDef,
): FieldSample[] {
  switch (sampler.type) {
    case 'grid':
      return sampleGrid(grid, sampler);
    case 'scanline':
      return sampleScanlines(grid, sampler, time);
    case 'offsetBundle':
      return sampleOffsetBundle(grid, sampler, time, pathDef);
  }
}

function sampleGrid(grid: FieldGrid, sampler: GridSamplerDef): FieldSample[] {
  const samples: FieldSample[] = [];
  const { cellSize, jitter, threshold } = sampler;

  const cols = Math.ceil(grid.width / cellSize);
  const rows = Math.ceil(grid.height / cellSize);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let x = col * cellSize + cellSize / 2;
      let y = row * cellSize + cellSize / 2;

      if (jitter > 0) {
        x += (seededRandom(col * 7919 + row * 104729) - 0.5) * cellSize * jitter;
        y += (seededRandom(col * 104729 + row * 7919) - 0.5) * cellSize * jitter;
      }

      const value = sampleFieldBilinear(grid, x, y);
      if (value > threshold) {
        samples.push({ x, y, value, angle: 0, length: value });
      }
    }
  }

  return samples;
}

function sampleScanlines(grid: FieldGrid, sampler: ScanlineSamplerDef, time: number): FieldSample[] {
  const samples: FieldSample[] = [];
  const { direction, lineSpacing, dashMinLength, dashMaxLength, gapChance, noiseBreak, noiseBreakScale, threshold } = sampler;

  const isHorizontal = direction === 'horizontal';
  const lines = isHorizontal ? Math.ceil(grid.height / lineSpacing) : Math.ceil(grid.width / lineSpacing);
  const lineLen = isHorizontal ? grid.width : grid.height;

  for (let line = 0; line < lines; line++) {
    const linePos = line * lineSpacing + lineSpacing / 2;
    let dashStart = -1;
    let inDash = false;

    for (let pos = 0; pos < lineLen; pos++) {
      const x = isHorizontal ? pos : linePos;
      const y = isHorizontal ? linePos : pos;
      const value = sampleFieldBilinear(grid, x, y);

      let shouldBeOn = value > threshold;

      if (shouldBeOn && noiseBreak) {
        const noiseVal = simpleHash(pos * noiseBreakScale + line * 31.7 + time * 0.1);
        if (noiseVal < gapChance) shouldBeOn = false;
      }

      if (shouldBeOn && !inDash) {
        dashStart = pos;
        inDash = true;
      } else if (!shouldBeOn && inDash) {
        const dashLen = Math.min(pos - dashStart, dashMaxLength);
        if (dashLen >= dashMinLength) {
          const cx = isHorizontal ? dashStart + dashLen / 2 : linePos;
          const cy = isHorizontal ? linePos : dashStart + dashLen / 2;
          const angle = isHorizontal ? 0 : Math.PI / 2;
          samples.push({ x: cx, y: cy, value: 1, angle, length: dashLen });
        }
        inDash = false;
      }

      if (inDash && (pos - dashStart) >= dashMaxLength) {
        const dashLen = dashMaxLength;
        const cx = isHorizontal ? dashStart + dashLen / 2 : linePos;
        const cy = isHorizontal ? linePos : dashStart + dashLen / 2;
        const angle = isHorizontal ? 0 : Math.PI / 2;
        samples.push({ x: cx, y: cy, value: 1, angle, length: dashLen });
        dashStart = pos;
      }
    }

    if (inDash) {
      const dashLen = Math.min(lineLen - dashStart, dashMaxLength);
      if (dashLen >= dashMinLength) {
        const cx = isHorizontal ? dashStart + dashLen / 2 : linePos;
        const cy = isHorizontal ? linePos : dashStart + dashLen / 2;
        const angle = isHorizontal ? 0 : Math.PI / 2;
        samples.push({ x: cx, y: cy, value: 1, angle, length: dashLen });
      }
    }
  }

  return samples;
}

function sampleOffsetBundle(
  grid: FieldGrid,
  sampler: OffsetBundleSamplerDef,
  time: number,
  pathDef?: PathFieldDef,
): FieldSample[] {
  const samples: FieldSample[] = [];
  const { copyCount, offsetSpacing, phaseOffset } = sampler;

  const basePath = pathDef?.points ?? generateDefaultWavePath(grid.width, grid.height, time);

  if (basePath.length < 2) return samples;

  const halfCount = copyCount / 2;

  for (let copy = 0; copy < copyCount; copy++) {
    const offsetFactor = (copy - halfCount) * offsetSpacing;
    const phase = copy * phaseOffset * time;

    const offsetPath = computeOffsetPath(basePath, offsetFactor, phase);

    for (let i = 0; i < offsetPath.length - 1; i++) {
      const p0 = offsetPath[i];
      const p1 = offsetPath[i + 1];
      const mx = (p0[0] + p1[0]) / 2;
      const my = (p0[1] + p1[1]) / 2;

      const fieldVal = sampleFieldBilinear(grid, mx, my);
      const dx = p1[0] - p0[0];
      const dy = p1[1] - p0[1];
      const angle = Math.atan2(dy, dx);
      const segLen = Math.sqrt(dx * dx + dy * dy);

      samples.push({
        x: mx,
        y: my,
        value: fieldVal > 0.01 ? fieldVal : 0,
        angle,
        length: segLen,
      });
    }
  }

  return samples;
}

function generateDefaultWavePath(width: number, height: number, time: number): [number, number][] {
  const points: [number, number][] = [];
  const segments = 80;
  const amplitude = height * 0.3;
  const frequency = 2;
  const phaseShift = time * 0.5;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = t * width;
    const y = height / 2 + Math.sin(t * Math.PI * frequency + phaseShift) * amplitude;
    points.push([x, y]);
  }

  return points;
}

function computeOffsetPath(
  basePath: [number, number][],
  offset: number,
  _phase: number,
): [number, number][] {
  const result: [number, number][] = [];

  for (let i = 0; i < basePath.length; i++) {
    const prev = basePath[Math.max(0, i - 1)];
    const next = basePath[Math.min(basePath.length - 1, i + 1)];

    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const nx = -dy / len;
    const ny = dx / len;

    result.push([
      basePath[i][0] + nx * offset,
      basePath[i][1] + ny * offset,
    ]);
  }

  return result;
}

function seededRandom(seed: number): number {
  let s = seed | 0;
  s = ((s >> 16) ^ s) * 0x45d9f3b;
  s = ((s >> 16) ^ s) * 0x45d9f3b;
  s = (s >> 16) ^ s;
  return (s & 0x7fffffff) / 0x7fffffff;
}

function simpleHash(x: number): number {
  const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}
