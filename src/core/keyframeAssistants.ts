import type { Keyframe } from './types';
import { mapValue, zipValues, type KeyframeValue } from './keyframeValue';

// The Smoother and The Wiggler - organic keyframe assistants (Category 1). Both are PURE array
// transforms over a property's keyframes + the set of SELECTED frames, returning a new list; the
// store wraps them in one undoable command. Kept in their own leaf module (no interpolation import)
// so they stay bundleable in a harness. The Wiggler is seeded (house mulberry32) → the OUTPUT is
// static, deterministic keyframe data, re-runnable and frame-pure.

// House PRNG (matches src/cloner/effectors.ts et al.).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Combine (seed, frame) into a uint32 so each keyframe gets its own deterministic noise stream.
function hash2(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return Math.imul(h, 1274126177) >>> 0;
}

/**
 * The Smoother - round jittery keyframe VALUES into a gentle curve with a weighted moving average
 * (¼ prev + ½ self + ¼ next). The first and last SELECTED keyframes are pinned so the animation's
 * endpoints don't drift. Needs ≥3 selected keyframes (two endpoints + something between). Number and
 * vec2 (per component). Frames are untouched.
 */
export function smoothSelected(kfs: Keyframe[], selected: Set<number>): Keyframe[] {
  const sel = kfs.filter((k) => selected.has(k.frame)).sort((a, b) => a.frame - b.frame);
  if (sel.length < 3) return kfs;
  const next = new Map<number, KeyframeValue>();
  for (let i = 1; i < sel.length - 1; i++) {
    // Per component (number, vec2 or an RGBA colour keyframe), shaped like the middle keyframe.
    next.set(sel[i].frame, zipValues([sel[i].value, sel[i - 1].value, sel[i + 1].value], ([c, p, n]) => 0.25 * p + 0.5 * c + 0.25 * n));
  }
  return kfs.map((k) => (next.has(k.frame) ? { ...k, value: next.get(k.frame)! } : k));
}

/**
 * Exponential Scale - convert a LINEAR ramp between the first and last selected keyframes into a
 * GEOMETRIC one, so a big scale/zoom reads as a constant-rate move instead of lurching (a real zoom
 * must grow by an accelerating amount to look steady). Bakes one keyframe per frame across the span
 * with `v0·(v1/v0)^t`; endpoints are preserved. Number and vec2 (per component). Falls back to linear
 * on any non-positive component (a geometric ramp is undefined through/!=0). Pure, no evaluation.
 */
export function exponentialScaleSelected(kfs: Keyframe[], selected: Set<number>): Keyframe[] {
  const sel = kfs.filter((k) => selected.has(k.frame)).sort((a, b) => a.frame - b.frame);
  if (sel.length < 2) return kfs;
  const f0 = sel[0].frame, f1 = sel[sel.length - 1].frame;
  if (f1 <= f0) return kfs;
  const startV = sel[0].value, endV = sel[sel.length - 1].value;
  const geo = (a: number, b: number, t: number) => (a > 0 && b > 0 ? a * Math.pow(b / a, t) : a + (b - a) * t);
  const outside = kfs.filter((k) => k.frame < f0 || k.frame > f1);
  const baked: Keyframe[] = [];
  for (let f = f0; f <= f1; f++) {
    const t = (f - f0) / (f1 - f0);
    const value = zipValues([startV, endV], ([a, b]) => geo(a, b, t));
    baked.push({ frame: f, value, interpolation: 'linear', handleIn: [0, 0], handleOut: [0, 0] });
  }
  const bakedFrames = new Set(baked.map((k) => k.frame));
  return [...outside.filter((k) => !bakedFrames.has(k.frame)), ...baked].sort((a, b) => a.frame - b.frame);
}

/**
 * The Wiggler - inject controlled organic tremble into the interior SELECTED keyframe values: each is
 * offset by seeded noise in [-amplitude, +amplitude]. Endpoints are pinned so the move still arrives
 * and departs cleanly. Needs ≥3 selected keyframes (bake a held range first for a dense wiggle).
 * Deterministic: identical (selection, amplitude, seed) → identical output. Number and vec2 (each
 * component gets its own draw, so X and Y don't move in lockstep).
 */
export function wiggleSelected(kfs: Keyframe[], selected: Set<number>, amplitude: number, seed: number): Keyframe[] {
  const sel = kfs.filter((k) => selected.has(k.frame)).sort((a, b) => a.frame - b.frame);
  if (sel.length < 3 || amplitude === 0) return kfs;
  const next = new Map<number, KeyframeValue>();
  for (let i = 1; i < sel.length - 1; i++) {
    const k = sel[i];
    const rng = mulberry32(hash2(seed, k.frame));
    // One draw per component in order (X then Y for a vec2: byte-identical to the original sequence).
    next.set(k.frame, mapValue(k.value, (x) => x + (rng() * 2 - 1) * amplitude));
  }
  return kfs.map((k) => (next.has(k.frame) ? { ...k, value: next.get(k.frame)! } : k));
}
