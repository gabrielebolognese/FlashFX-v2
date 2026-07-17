// Cloner — default-constructor helpers (mirrors core/factory.ts's role of building
// well-formed domain objects). Kept out of the pure engine so distribution.ts has
// no construction concerns.

import { createTransform } from '../core/factory';
import type { ClonerLayer, GridDistribution, RadialDistribution, PathDistribution } from './types';

export function createGridDistribution(overrides: Partial<GridDistribution> = {}): GridDistribution {
  return {
    type: 'grid',
    countX: 5,
    countY: 5,
    countZ: 1,
    spacing: { x: 100, y: 100, z: 0 },
    origin: { x: 0, y: 0, z: 0 },
    rowOffset: 0,
    ...overrides,
  };
}

export function createRadialDistribution(overrides: Partial<RadialDistribution> = {}): RadialDistribution {
  return {
    type: 'radial',
    count: 8,
    radius: 200,
    arcDegrees: 360,
    center: { x: 0, y: 0, z: 0 },
    startAngleDegrees: 0,
    orientToCenter: true,
    ...overrides,
  };
}

export function createPathDistribution(pathRef: string, overrides: Partial<PathDistribution> = {}): PathDistribution {
  return {
    type: 'path',
    pathRef,
    count: 10,
    arcLengthCorrected: true,
    orientToPath: true,
    ...overrides,
  };
}

/** A ready-to-use grid cloner sourcing an existing layer. Safety cap is generous. */
export function createDefaultCloner(id: string, sourceLayerId: string): ClonerLayer {
  return {
    id,
    type: 'cloner',
    name: 'Cloner',
    parentId: null,
    trackId: null,
    visible: true,
    locked: false,
    blendMode: 'normal',
    transform: createTransform(0, 0),
    inPoint: 0,
    outPoint: 300,
    sourceRef: { type: 'layer', layerId: sourceLayerId },
    distribution: createGridDistribution(),
    effectors: [],
    stagger: { delaySeconds: 0 },
    renderCount: 500,
  };
}
