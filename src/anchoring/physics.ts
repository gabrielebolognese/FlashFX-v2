import type { AnchorPhysicsConfig } from '../core/types';

interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

interface RopeConfig {
  length: number;
  stiffness: number;
  gravity: number;
}

interface MagneticConfig {
  strength: number;
  falloff: number;
  maxDistance: number;
}

export interface PhysicsState {
  position: number;
  velocity: number;
}

export function stepSpring(
  config: SpringConfig,
  state: PhysicsState,
  target: number,
  dt: number,
): PhysicsState {
  const { stiffness, damping, mass } = config;
  const displacement = state.position - target;
  const springForce = -stiffness * displacement;
  const dampingForce = -damping * state.velocity;
  const acceleration = (springForce + dampingForce) / mass;
  const velocity = state.velocity + acceleration * dt;
  const position = state.position + velocity * dt;
  return { position, velocity };
}

export function stepRope(
  config: RopeConfig,
  state: PhysicsState,
  anchorPosition: number,
  dt: number,
): PhysicsState {
  const { length, stiffness, gravity } = config;
  const distance = state.position - anchorPosition;
  let force = 0;
  if (Math.abs(distance) > length) {
    const overstretch = Math.abs(distance) - length;
    force = -Math.sign(distance) * overstretch * stiffness;
  }
  force += gravity;
  const velocity = state.velocity + force * dt;
  const position = state.position + velocity * dt;
  return { position, velocity };
}

export function evaluateMagnetic(
  config: MagneticConfig,
  sourceValue: number,
  targetValue: number,
): number {
  const { strength, falloff, maxDistance } = config;
  const distance = Math.abs(sourceValue - targetValue);
  if (distance > maxDistance) return targetValue;
  const influence = strength / Math.pow(1 + distance, falloff);
  return targetValue + (sourceValue - targetValue) * Math.min(1, influence);
}

export function simulatePhysics(
  config: AnchorPhysicsConfig,
  sourceValues: number[],
  frameRate: number,
): number[] {
  const dt = 1 / frameRate;
  const result: number[] = new Array(sourceValues.length);

  if (config.type === 'magnetic' && config.magnetic) {
    for (let i = 0; i < sourceValues.length; i++) {
      result[i] = evaluateMagnetic(
        config.magnetic,
        sourceValues[i],
        i > 0 ? result[i - 1] : sourceValues[0],
      );
    }
    return result;
  }

  if (config.type === 'spring' && config.spring) {
    let state: PhysicsState = { position: sourceValues[0], velocity: 0 };
    for (let i = 0; i < sourceValues.length; i++) {
      state = stepSpring(config.spring, state, sourceValues[i], dt);
      result[i] = state.position;
    }
    return result;
  }

  if (config.type === 'rope' && config.rope) {
    let state: PhysicsState = { position: sourceValues[0], velocity: 0 };
    for (let i = 0; i < sourceValues.length; i++) {
      state = stepRope(config.rope, state, sourceValues[i], dt);
      result[i] = state.position;
    }
    return result;
  }

  return [...sourceValues];
}
