// Cloner — default-constructor helpers (mirrors core/factory.ts's role of building
// well-formed domain objects). Kept out of the pure engine so distribution.ts has
// no construction concerns.

import { createTransform } from '../core/factory';
import type {
  ClonerLayer, GridDistribution, RadialDistribution, PathDistribution,
  RandomEffector, FalloffEffector, StepEffector, TimeEffector, TargetEffector, ClonerEffector,
} from './types';

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

// ── Effector default-constructors (for the authoring UI's "add effector"). ──
// Each seeds sensible, visible defaults. `random`'s seed is caller-supplied so two
// random effectors don't correlate; it is stored, then used deterministically per frame
// (never Math.random at evaluation time).

export function createRandomEffector(seed = 1): RandomEffector {
  return {
    type: 'random', strength: 1, blendMode: 'add', seed,
    positionAmount: { x: 50, y: 50, z: 0 }, rotationAmount: { x: 0, y: 0, z: 0 },
    scaleAmount: 0, opacityAmount: 0,
  };
}

export function createFalloffEffector(): FalloffEffector {
  return {
    type: 'falloff', strength: 1, blendMode: 'add',
    shape: { type: 'radial', center: { x: 0, y: 0, z: 0 }, innerRadius: 0, outerRadius: 300 },
    curveExponent: 1,
    positionDelta: { x: 0, y: 0, z: 0 }, rotationDelta: { x: 0, y: 0, z: 0 },
    scaleDelta: -0.5, colorDelta: { x: 0, y: 0, z: 0 }, opacityDelta: 0,
  };
}

export function createStepEffector(): StepEffector {
  return {
    type: 'step', strength: 1, blendMode: 'add', waveform: 'sine', frequency: 1, phase: 0,
    positionAmount: { x: 0, y: 30, z: 0 }, rotationAmount: { x: 0, y: 0, z: 0 }, scaleAmount: 0, opacityAmount: 0,
  };
}

export function createTimeEffector(): TimeEffector {
  return {
    type: 'time', strength: 1, blendMode: 'add', waveform: 'sine', frequency: 1, phase: 0,
    positionAmount: { x: 0, y: 30, z: 0 }, rotationAmount: { x: 0, y: 0, z: 0 }, scaleAmount: 0, opacityAmount: 0,
  };
}

export function createTargetEffector(): TargetEffector {
  return { type: 'target', strength: 1, blendMode: 'override', target: { x: 0, y: 0, z: 0 } };
}

/** Build a default effector of the given type (seed varied for `random`). */
export function createEffector(type: ClonerEffector['type'], seed = 1): ClonerEffector {
  switch (type) {
    case 'random': return createRandomEffector(seed);
    case 'falloff': return createFalloffEffector();
    case 'step': return createStepEffector();
    case 'time': return createTimeEffector();
    case 'target': return createTargetEffector();
  }
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
