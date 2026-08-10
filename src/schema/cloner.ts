import { z } from 'zod/v4';
import { zVec3, zId } from './primitives';
import { EFFECTOR_BLEND_MODES, EFFECTOR_WAVEFORMS } from './enums';
import type { Caps } from './caps';

// Cloner / effector configuration — a faithful, strict mirror of src/cloner/types.ts. This is how
// the Coder expresses PARAMETRIC and INDEX-DRIVEN variation (the AI expression channel was dropped;
// the cloner engine is already pure, frame-deterministic, seeded, per-index, and bans Math.random —
// exactly what an expression language would have been for). renderCount and the effector-stack
// length are the two hard caps enforced here at parse time.

const zGridDist = z.strictObject({
  type: z.literal('grid'),
  countX: z.int().min(1), countY: z.int().min(1), countZ: z.int().min(1),
  spacing: zVec3, origin: zVec3, rowOffset: z.number(),
});
const zRadialDist = z.strictObject({
  type: z.literal('radial'),
  count: z.int().min(1), radius: z.number(), arcDegrees: z.number(),
  center: zVec3, startAngleDegrees: z.number(), orientToCenter: z.boolean(),
});
const zPathDist = z.strictObject({
  type: z.literal('path'),
  pathRef: zId, count: z.int().min(1), arcLengthCorrected: z.boolean(), orientToPath: z.boolean(),
});
const zFieldDist = z.strictObject({
  type: z.literal('field'),
  fieldRef: zId, sampleResolution: z.int().min(1), threshold: z.number(),
  maxCount: z.int().min(1), origin: zVec3, size: zVec3,
});
export const zClonerDistribution = z.discriminatedUnion('type', [zGridDist, zRadialDist, zPathDist, zFieldDist]);

// Effectors — each carries strength + blendMode (EffectorCommon).
const common = { strength: z.number(), blendMode: z.enum(EFFECTOR_BLEND_MODES) };

const zRandomEff = z.strictObject({
  type: z.literal('random'),
  ...common,
  seed: z.int().describe('REQUIRED deterministic seed; hashed with index (Math.random is banned)'),
  positionAmount: zVec3, rotationAmount: zVec3, scaleAmount: z.number(), opacityAmount: z.number(),
});
const zFalloffShape = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('linear'), start: zVec3, direction: zVec3, length: z.number() }),
  z.strictObject({ type: z.literal('radial'), center: zVec3, innerRadius: z.number(), outerRadius: z.number() }),
  z.strictObject({ type: z.literal('box'), center: zVec3, halfExtents: zVec3, softness: z.number() }),
  z.strictObject({ type: z.literal('field'), fieldRef: zId, origin: zVec3, size: zVec3 }),
]);
const zFalloffEff = z.strictObject({
  type: z.literal('falloff'),
  ...common,
  shape: zFalloffShape, curveExponent: z.number(),
  positionDelta: zVec3, rotationDelta: zVec3, scaleDelta: z.number(), colorDelta: zVec3, opacityDelta: z.number(),
});
const waveEff = (t: 'step' | 'time') => z.strictObject({
  type: z.literal(t),
  ...common,
  waveform: z.enum(EFFECTOR_WAVEFORMS), frequency: z.number(), phase: z.number(),
  positionAmount: zVec3, rotationAmount: zVec3, scaleAmount: z.number(), opacityAmount: z.number(),
});
const zTargetEff = z.strictObject({ type: z.literal('target'), ...common, target: zVec3 });

export const zClonerEffector = z.discriminatedUnion('type', [
  zRandomEff, zFalloffEff, waveEff('step'), waveEff('time'), zTargetEff,
]);

const zClonerStagger = z.strictObject({
  delaySeconds: z.number(),
  curve: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']).optional(),
});
const zClonerSourceRef = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('layer'), layerId: zId }),
  z.strictObject({ type: z.literal('composition'), compositionId: zId }),
]);
const zClonerDataBinding = z.strictObject({
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))),
  bindings: z.array(z.strictObject({ propertyPath: z.string(), dataKey: z.string() })),
});

/** Factory: the cloner-specific config block (shared by the AI cloner layer and the document form).
 *  renderCount ≤ caps.maxClonerInstances and effectors ≤ caps.maxEffectorsPerCloner are enforced. */
export function makeClonerConfig(caps: Caps) {
  return {
    sourceRef: zClonerSourceRef,
    distribution: zClonerDistribution,
    effectors: z.array(zClonerEffector).max(caps.maxEffectorsPerCloner),
    stagger: zClonerStagger,
    renderCount: z.int().min(1).max(caps.maxClonerInstances)
      .describe('hard instance cap (enforced: truncate lowest-index first)'),
    dataBinding: zClonerDataBinding.optional(),
  };
}

export const EXPORTED_FOR_TYPES = z.strictObject(makeClonerConfig({
  maxPanels: 0, maxLayersPerPanel: 0, maxLayersTotal: 0, maxDurationFrames: 0, maxKeyframesPerTrack: 0,
  maxClonerInstances: 1, maxEffectorsPerCloner: 1, maxPaletteEntries: 0, maxPatchOps: 0,
}));
export type ClonerConfig = z.infer<typeof EXPORTED_FOR_TYPES>;
export type ClonerDistributionT = z.infer<typeof zClonerDistribution>;
export type ClonerEffectorT = z.infer<typeof zClonerEffector>;
