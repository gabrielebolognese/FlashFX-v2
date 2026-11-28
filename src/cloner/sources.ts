// Cloner per-instance sources (B60 + follow-up). Pure helpers, shared by core/interpolation.ts (the
// cloner expansion in resolveFrame) and the verify harness.
//
// - pickSourceSlot: which entry of `cloner.sources` instance i draws. 'cycle' (default) = i mod n, the
//   B60 behaviour; 'random' = a seeded, scrub-stable pick per instance (a swarm of mixed cards, a
//   confetti of different shapes). Same (index, n, seed) -> same slot, on any machine.
// - relativeSourceScale / relativeSourceTransform: an extra source keeps its own scale, rotation and
//   opacity RELATIVE to the main source's settled transform, so photos of different resolutions that
//   the agent scaled to one tile size stay that size inside the cloner. The main source itself gets
//   the identity (its copies are exactly as before B60's follow-up), and a source with the same
//   scale / rotation / opacity as the main one also gets the identity.
// - settledFrame: the frame at which the main source's transform has settled (its last transform
//   key; 0 when nothing is keyed), so an intro pop on the main source (scale 0 -> 1) is not divided out.

import type { Transform, AnimatableProperty } from '../core/types';

export type ClonerSourceOrder = 'cycle' | 'random';

/** 32-bit integer hash (lowbias32), deterministic across platforms. */
function hash32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Slot in [0, n) that instance `index` draws. n <= 0 returns -1 (no per-instance sources). */
export function pickSourceSlot(index: number, n: number, order: ClonerSourceOrder | undefined, seed: number | undefined): number {
  if (!(n > 0)) return -1;
  const i = Math.trunc(index);
  if (order !== 'random') return ((i % n) + n) % n;
  const s = Number.isFinite(seed) ? Math.trunc(seed as number) : 0;
  return hash32((i * 0x9e3779b1) ^ hash32(s + 0x632be5ab)) % n;
}

/** The frame at which a transform has settled: its last keyframe on any transform property (0 = static). */
export function settledFrame(transform: Transform): number {
  let last = 0;
  const props: (AnimatableProperty | undefined)[] = [
    transform.position, transform.rotation, transform.scale, transform.anchorPoint, transform.opacity,
    transform.positionZ, transform.rotationX, transform.rotationY,
  ];
  for (const p of props) {
    if (!p || !Array.isArray(p.keyframes)) continue;
    for (const k of p.keyframes) if (Number.isFinite(k.frame) && k.frame > last) last = k.frame;
  }
  return last;
}

export interface SourceTransformParts {
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

const ratio = (own: number, main: number): number => (Math.abs(main) > 1e-9 ? own / main : own);

/** The extra source's own scale / rotation / opacity relative to the main source's settled transform. */
export function relativeSourceTransform(own: SourceTransformParts, mainSettled: SourceTransformParts): SourceTransformParts {
  return {
    scaleX: ratio(own.scaleX, mainSettled.scaleX),
    scaleY: ratio(own.scaleY, mainSettled.scaleY),
    rotation: own.rotation - mainSettled.rotation,
    opacity: Math.max(0, Math.min(1, ratio(own.opacity, mainSettled.opacity))),
  };
}

/** True when a relative transform changes nothing (the stamp keeps the instance transform as is). */
export function isIdentityRelative(r: SourceTransformParts): boolean {
  return r.scaleX === 1 && r.scaleY === 1 && r.rotation === 0 && r.opacity === 1;
}
