// Cloner — effectors: pure per-instance transform modulation + stack composition.
//
// FRAME-PURITY is the whole point of this file. Every effector's output is a pure
// function of (index, basePosition, time, its params). The Random effector is the
// ONE place a naive implementation silently breaks purity: Math.random()/Date are
// BANNED — a seeded hash of (seed, index) is used so a scrub is always reproducible.

import { sampleFieldBilinear } from '../field-sampling/fields';
import type { FieldGrid } from '../field-sampling/fields';
import type {
  ClonerEffector,
  EffectorBlendMode,
  EffectorWaveform,
  FalloffEffector,
  FalloffShape,
  InstanceTransform,
  RandomEffector,
  StepEffector,
  TargetEffector,
  TimeEffector,
  TransformDelta,
  Vec3,
} from './types';

/** Resolver for the field-falloff variant: field ref → already-sampled buffer. */
type GetField = (fieldRef: string) => FieldGrid | undefined;

// House RNG — identical algorithm to the mulberry32 copies in particles/procedural/
// stagger (this codebase keeps a private copy per module rather than a shared util).
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// fmix32 integer hash — decorrelates (seed, index) so adjacent indices don't get
// correlated first draws (acceptance: distinct output, no collisions over 0..999).
function hashSeed(seed: number, index: number): number {
  let h = (seed | 0) ^ Math.imul(index + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

const DEG = 180 / Math.PI;

const zero3 = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const scale3 = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

function emptyDelta(): TransformDelta {
  return {
    positionDelta: zero3(),
    rotationDelta: zero3(),
    scaleDelta: zero3(),
    colorDelta: zero3(),
    opacityDelta: 0,
  };
}

/** Unit waveform in [-1, 1] for a fractional/whole phase. */
function waveform(kind: EffectorWaveform, phase: number): number {
  const frac = phase - Math.floor(phase);
  switch (kind) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'triangle':
      return 1 - 4 * Math.abs(frac - 0.5);
    case 'square':
      return frac < 0.5 ? 1 : -1;
    case 'sawtooth':
      return 2 * frac - 1;
  }
}

/**
 * Scalar falloff in [0,1]. CONVENTION (pinned): 1 at/inside the near boundary,
 * fading to 0 at the far boundary. radial: 1 at innerRadius, 0 at outerRadius.
 * linear: 1 at start plane, 0 at `length` along `direction`. box: 1 inside, 0 once
 * `softness` beyond the box. The result is raised to `curveExponent`.
 */
function falloffStrength(shape: FalloffShape, pos: Vec3, exponent: number, getField?: GetField): number {
  let s: number;
  switch (shape.type) {
    case 'field': {
      // Sample the resolved field at the world position mapped into field space.
      const grid = getField?.(shape.fieldRef);
      if (!grid) {
        s = 0;
        break;
      }
      const u = (pos.x - shape.origin.x) / (shape.size.x || 1);
      const v = (pos.y - shape.origin.y) / (shape.size.y || 1);
      s = clamp01(sampleFieldBilinear(grid, u * grid.width, v * grid.height));
      break;
    }
    case 'radial': {
      const dx = pos.x - shape.center.x;
      const dy = pos.y - shape.center.y;
      const dz = pos.z - shape.center.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const span = shape.outerRadius - shape.innerRadius;
      s = span <= 0 ? (d <= shape.innerRadius ? 1 : 0) : 1 - clamp01((d - shape.innerRadius) / span);
      break;
    }
    case 'linear': {
      const len = Math.hypot(shape.direction.x, shape.direction.y, shape.direction.z) || 1;
      const proj =
        ((pos.x - shape.start.x) * shape.direction.x +
          (pos.y - shape.start.y) * shape.direction.y +
          (pos.z - shape.start.z) * shape.direction.z) /
        len;
      s = shape.length <= 0 ? (proj <= 0 ? 1 : 0) : 1 - clamp01(proj / shape.length);
      break;
    }
    case 'box': {
      const ox = Math.max(0, Math.abs(pos.x - shape.center.x) - shape.halfExtents.x);
      const oy = Math.max(0, Math.abs(pos.y - shape.center.y) - shape.halfExtents.y);
      const oz = Math.max(0, Math.abs(pos.z - shape.center.z) - shape.halfExtents.z);
      const outside = Math.max(ox, oy, oz);
      s = shape.softness <= 0 ? (outside <= 0 ? 1 : 0) : 1 - clamp01(outside / shape.softness);
      break;
    }
  }
  return Math.pow(clamp01(s), Math.max(0, exponent));
}

function randomDelta(index: number, e: RandomEffector): TransformDelta {
  const rng = mulberry32(hashSeed(e.seed, index));
  const r = (): number => rng() * 2 - 1; // centered [-1, 1]
  const px = e.positionAmount.x * r();
  const py = e.positionAmount.y * r();
  const pz = e.positionAmount.z * r();
  const rx = e.rotationAmount.x * r();
  const ry = e.rotationAmount.y * r();
  const rz = e.rotationAmount.z * r();
  const sc = e.scaleAmount * r();
  const op = e.opacityAmount * r();
  return {
    positionDelta: { x: px, y: py, z: pz },
    rotationDelta: { x: rx, y: ry, z: rz },
    scaleDelta: { x: sc, y: sc, z: sc },
    colorDelta: zero3(),
    opacityDelta: op,
  };
}

function falloffDelta(basePosition: Vec3, e: FalloffEffector, getField?: GetField): TransformDelta {
  const s = falloffStrength(e.shape, basePosition, e.curveExponent, getField);
  return {
    positionDelta: scale3(e.positionDelta, s),
    rotationDelta: scale3(e.rotationDelta, s),
    scaleDelta: { x: e.scaleDelta * s, y: e.scaleDelta * s, z: e.scaleDelta * s },
    colorDelta: scale3(e.colorDelta, s),
    opacityDelta: e.opacityDelta * s,
  };
}

function waveDelta(phase: number, e: StepEffector | TimeEffector): TransformDelta {
  const w = waveform(e.waveform, phase);
  return {
    positionDelta: scale3(e.positionAmount, w),
    rotationDelta: scale3(e.rotationAmount, w),
    scaleDelta: { x: e.scaleAmount * w, y: e.scaleAmount * w, z: e.scaleAmount * w },
    colorDelta: zero3(),
    opacityDelta: e.opacityAmount * w,
  };
}

function targetDelta(basePosition: Vec3, e: TargetEffector): TransformDelta {
  const angle = Math.atan2(e.target.y - basePosition.y, e.target.x - basePosition.x) * DEG;
  const d = emptyDelta();
  d.rotationDelta = { x: 0, y: 0, z: angle };
  return d;
}

/**
 * The pure per-effector output. `basePosition` is the instance's BASE distribution
 * position (not the running effector-displaced one) so falloff/target sample a
 * stable, predictable point. `time` is the global playhead frame.
 */
export function effectorOutput(
  index: number,
  basePosition: Vec3,
  time: number,
  e: ClonerEffector,
  getField?: GetField,
): TransformDelta {
  switch (e.type) {
    case 'random':
      return randomDelta(index, e);
    case 'falloff':
      return falloffDelta(basePosition, e, getField);
    case 'step':
      return waveDelta(index * e.frequency + e.phase, e);
    case 'time':
      return waveDelta(time * e.frequency + e.phase, e);
    case 'target':
      return targetDelta(basePosition, e);
  }
}

/**
 * Fold one effector's channel delta into the running accumulated value.
 *   add:      acc + delta·strength               (delta is an offset/fraction)
 *   multiply: acc · (1 + delta·strength)          (delta is a fractional deviation)
 *   override: lerp(acc, delta, strength)          (delta is the ABSOLUTE target;
 *             partial-influence replace — full at strength 1, half at 0.5)
 */
function blend(acc: number, delta: number, mode: EffectorBlendMode, strength: number): number {
  switch (mode) {
    case 'add':
      return acc + delta * strength;
    case 'multiply':
      return acc * (1 + delta * strength);
    case 'override':
      return acc + (delta - acc) * strength;
  }
}

/**
 * Compose an ordered effector stack on top of a base InstanceTransform. Effectors
 * apply IN ARRAY ORDER (order is significant — add-then-multiply ≠ multiply-then-add).
 * Pure: builds a fresh transform, mutates nothing.
 */
export function applyEffectorStack(
  base: InstanceTransform,
  effectors: ClonerEffector[],
  index: number,
  time: number,
  getField?: GetField,
): InstanceTransform {
  let posX = base.position.x;
  let posY = base.position.y;
  let posZ = base.position.z;
  let rotX = base.rotationDegrees.x;
  let rotY = base.rotationDegrees.y;
  let rotZ = base.rotationDegrees.z;
  let sclX = base.scale.x;
  let sclY = base.scale.y;
  let sclZ = base.scale.z;
  let colR = base.colorTint.r;
  let colG = base.colorTint.g;
  let colB = base.colorTint.b;
  let op = base.opacity;

  for (const e of effectors) {
    // Sample against the ORIGINAL base position so a prior position effector does
    // not move a later falloff/target's sample point (predictable + testable).
    const d = effectorOutput(index, base.position, time, e, getField);
    const m = e.blendMode;
    const st = e.strength;
    posX = blend(posX, d.positionDelta.x, m, st);
    posY = blend(posY, d.positionDelta.y, m, st);
    posZ = blend(posZ, d.positionDelta.z, m, st);
    rotX = blend(rotX, d.rotationDelta.x, m, st);
    rotY = blend(rotY, d.rotationDelta.y, m, st);
    rotZ = blend(rotZ, d.rotationDelta.z, m, st);
    sclX = blend(sclX, d.scaleDelta.x, m, st);
    sclY = blend(sclY, d.scaleDelta.y, m, st);
    sclZ = blend(sclZ, d.scaleDelta.z, m, st);
    colR = blend(colR, d.colorDelta.x, m, st);
    colG = blend(colG, d.colorDelta.y, m, st);
    colB = blend(colB, d.colorDelta.z, m, st);
    op = blend(op, d.opacityDelta, m, st);
  }

  return {
    index,
    position: { x: posX, y: posY, z: posZ },
    rotationDegrees: { x: rotX, y: rotY, z: rotZ },
    scale: { x: sclX, y: sclY, z: sclZ },
    colorTint: { r: colR, g: colG, b: colB },
    opacity: op,
  };
}
