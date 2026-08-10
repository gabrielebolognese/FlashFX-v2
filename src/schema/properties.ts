import { z } from 'zod/v4';
import { INTERPOLATION_TYPES } from './enums';
import { zVec2, zFrame, zUnit } from './primitives';
import { zEasingName } from './easing';
import type { Caps } from './caps';

// Property channels. TWO forms deliberately:
//   • DOCUMENT form (`*Doc`) mirrors src/core/types.ts exactly, for lossless round-trip of hand-
//     authored scenes. Cap-free (a hand scene may have any keyframe count).
//   • AI-AUTHORING form (`makeAi*`) is COMPACT so the cheap case is cheap: a static value is a bare
//     literal (a number or [x,y]), an animated value is `{ keyframes: [...] }` with NAMED easing.
//     Assembly expands the compact form into the full document AnimatableProperty. Cap-bound (track
//     length ≤ caps.maxKeyframesPerTrack) so an over-budget track is rejected at parse time.

// ── DOCUMENT form (lossless mirror of core) ──

const zValue = z.union([z.number(), zVec2]); // core Keyframe.value : number | Vec2

export const zKeyframeDoc = z
  .strictObject({
    frame: zFrame,
    value: zValue,
    interpolation: z.enum(INTERPOLATION_TYPES),
    handleIn: zVec2,
    handleOut: zVec2,
    tangentMode: z.enum(['continuous', 'broken']).optional(),
  })
  .describe('a keyframe (document form; mirrors core Keyframe)');

function animatableDoc(valueType: 'number' | 'vec2', value: z.ZodTypeAny) {
  return z.strictObject({
    id: z.string().min(1),
    name: z.string(),
    valueType: z.literal(valueType),
    defaultValue: value,
    keyframes: z.array(zKeyframeDoc),
  });
}
export const zAnimatableNumberDoc = animatableDoc('number', z.number());
export const zAnimatableVec2Doc = animatableDoc('vec2', zVec2);
export const zAnimatablePropertyDoc = z.union([zAnimatableNumberDoc, zAnimatableVec2Doc]);

export const zTransformDoc = z
  .strictObject({
    position: zAnimatableVec2Doc,
    rotation: zAnimatableNumberDoc,
    scale: zAnimatableVec2Doc,
    anchorPoint: zAnimatableVec2Doc,
    opacity: zAnimatableNumberDoc,
    positionZ: zAnimatableNumberDoc.optional(),
    rotationX: zAnimatableNumberDoc.optional(),
    rotationY: zAnimatableNumberDoc.optional(),
  })
  .describe('a layer transform (document form)');

// ── AI-AUTHORING form (compact; cap-bound) ──

/** One authoring keyframe: a value at an absolute frame with a NAMED easing (assembly resolves the
 *  easing to concrete handles). `easing` is the outgoing segment's easing; optional (defaults at
 *  expansion). Not `.strict()`-broken: closed to unknown keys. */
export const zAiKeyframeNumber = z.strictObject({ frame: zFrame, value: z.number(), easing: zEasingName.optional() });
export const zAiKeyframeVec2 = z.strictObject({ frame: zFrame, value: zVec2, easing: zEasingName.optional() });

/** Factory: compact AI number property = a bare number (static) OR an animated track. */
export function makeAiNumberProp(caps: Caps) {
  return z.union([
    z.number(),
    z.strictObject({ keyframes: z.array(zAiKeyframeNumber).min(1).max(caps.maxKeyframesPerTrack) }),
  ]);
}
export function makeAiVec2Prop(caps: Caps) {
  return z.union([
    zVec2,
    z.strictObject({ keyframes: z.array(zAiKeyframeVec2).min(1).max(caps.maxKeyframesPerTrack) }),
  ]);
}

/** Factory: compact AI transform. Every field optional so a static layout emits only what it sets
 *  (assembly fills identity defaults: position→comp centre, scale→[1,1], rotation/opacity→0/1). */
export function makeAiTransform(caps: Caps) {
  const num = makeAiNumberProp(caps);
  const vec = makeAiVec2Prop(caps);
  return z
    .strictObject({
      position: vec.optional(),
      rotation: num.optional(),
      scale: vec.optional(),
      anchor: vec.optional(),
      opacity: num.optional(),
      // 2.5D (only meaningful with a camera); optional.
      positionZ: num.optional(),
      rotationX: num.optional(),
      rotationY: num.optional(),
    })
    .describe('compact AI transform; omitted fields default at assembly');
}

export type KeyframeDoc = z.infer<typeof zKeyframeDoc>;
export type TransformDoc = z.infer<typeof zTransformDoc>;
export type { Caps };
// AI opacity note: opacity stays 0..1 in the document; the compact number channel does not itself
// clamp (assembly clamps), but a static opacity emitted as a bare number is validated downstream.
export const zAiOpacityHint = zUnit; // exported for slots that want the 0..1 bound structurally
