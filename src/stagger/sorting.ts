import type { BoundingBox, StaggerConfig } from './types';

type BoundsGetter = (id: string) => BoundingBox;

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleFromCenter(cx: number, cy: number, px: number, py: number): number {
  return Math.atan2(px - cx, -(py - cy));
}

function average(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

export function sortByDirection(
  layerIds: string[],
  config: StaggerConfig,
  getBounds: BoundsGetter,
  layerStackOrder: string[],
): string[] {
  let sorted: string[];

  switch (config.directionMode) {
    case 'layerStackOrder':
      sorted = sortByLayerStack(layerIds, layerStackOrder);
      break;
    case 'selectionClickOrder':
      sorted = [...layerIds];
      break;
    case 'spatialLeftToRight':
      sorted = sortBySpatialAxis(layerIds, getBounds, 'x', true);
      break;
    case 'spatialRightToLeft':
      sorted = sortBySpatialAxis(layerIds, getBounds, 'x', false);
      break;
    case 'spatialTopToBottom':
      sorted = sortBySpatialAxis(layerIds, getBounds, 'y', true);
      break;
    case 'spatialBottomToTop':
      sorted = sortBySpatialAxis(layerIds, getBounds, 'y', false);
      break;
    case 'radialOutward':
      sorted = sortByRadial(layerIds, getBounds, config, true);
      break;
    case 'radialInward':
      sorted = sortByRadial(layerIds, getBounds, config, false);
      break;
    case 'gridSnake':
      sorted = sortGridSnake(layerIds, getBounds, config.rowToleranceFraction);
      break;
    case 'randomChaos':
      sorted = sortRandomChaos(layerIds, config.randomSeed);
      break;
    default:
      sorted = [...layerIds];
  }

  if (config.invertOrder) {
    sorted.reverse();
  }

  return sorted;
}

function sortByLayerStack(layerIds: string[], layerStackOrder: string[]): string[] {
  const orderMap = new Map<string, number>();
  layerStackOrder.forEach((id, i) => orderMap.set(id, i));
  return [...layerIds].sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
}

function sortBySpatialAxis(
  layerIds: string[],
  getBounds: BoundsGetter,
  axis: 'x' | 'y',
  ascending: boolean,
): string[] {
  return [...layerIds].sort((a, b) => {
    const boundsA = getBounds(a);
    const boundsB = getBounds(b);
    const valA = axis === 'x' ? boundsA.centerX : boundsA.centerY;
    const valB = axis === 'x' ? boundsB.centerX : boundsB.centerY;
    const delta = ascending ? valA - valB : valB - valA;
    if (Math.abs(delta) > 0.01) return delta;
    const secA = axis === 'x' ? boundsA.centerY : boundsA.centerX;
    const secB = axis === 'x' ? boundsB.centerY : boundsB.centerX;
    return secA - secB;
  });
}

function sortByRadial(
  layerIds: string[],
  getBounds: BoundsGetter,
  config: StaggerConfig,
  outward: boolean,
): string[] {
  const center = resolveRadialCenter(layerIds, getBounds, config);

  return [...layerIds].sort((a, b) => {
    const boundsA = getBounds(a);
    const boundsB = getBounds(b);
    const distA = distance(boundsA.centerX, boundsA.centerY, center.x, center.y);
    const distB = distance(boundsB.centerX, boundsB.centerY, center.x, center.y);
    const distDelta = outward ? distA - distB : distB - distA;
    if (Math.abs(distDelta) > 0.01) return distDelta;
    const angleA = angleFromCenter(center.x, center.y, boundsA.centerX, boundsA.centerY);
    const angleB = angleFromCenter(center.x, center.y, boundsB.centerX, boundsB.centerY);
    return angleA - angleB;
  });
}

function resolveRadialCenter(
  layerIds: string[],
  getBounds: BoundsGetter,
  config: StaggerConfig,
): { x: number; y: number } {
  if (config.radialCenterMode === 'masterLayer' && config.radialMasterLayerId) {
    const masterBounds = getBounds(config.radialMasterLayerId);
    return { x: masterBounds.centerX, y: masterBounds.centerY };
  }
  const xs = layerIds.map((id) => getBounds(id).centerX);
  const ys = layerIds.map((id) => getBounds(id).centerY);
  return { x: average(xs), y: average(ys) };
}

export function sortGridSnake(
  layerIds: string[],
  getBounds: BoundsGetter,
  rowToleranceFraction: number,
): string[] {
  const items = layerIds.map((id) => {
    const b = getBounds(id);
    return { id, cx: b.centerX, cy: b.centerY, h: b.height };
  });

  const sortedByY = [...items].sort((a, b) => a.cy - b.cy);
  const avgHeight = average(items.map((i) => i.h)) || 50;
  const rowTolerance = avgHeight * rowToleranceFraction;

  const rows: (typeof items)[] = [];
  for (const item of sortedByY) {
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const lastRowAvgY = average(lastRow.map((i) => i.cy));
      if (Math.abs(item.cy - lastRowAvgY) <= rowTolerance) {
        lastRow.push(item);
        continue;
      }
    }
    rows.push([item]);
  }

  const result: string[] = [];
  rows.forEach((row, rowIndex) => {
    const sortedRow = [...row].sort((a, b) =>
      rowIndex % 2 === 0 ? a.cx - b.cx : b.cx - a.cx
    );
    result.push(...sortedRow.map((i) => i.id));
  });

  return result;
}

function sortRandomChaos(layerIds: string[], seed: number): string[] {
  const rng = mulberry32(seed);
  return [...layerIds]
    .map((id) => ({ id, key: rng() }))
    .sort((a, b) => a.key - b.key)
    .map((item) => item.id);
}
