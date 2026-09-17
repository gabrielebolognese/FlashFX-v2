import type { Keyframe, Vec2 } from './types';

// The Smoother and The Wiggler - organic keyframe assistants (Category 1). Both are PURE array
// transforms over a property's keyframes + the set of SELECTED frames, returning a new list; the
// store wraps them in one undoable command. Kept in their own leaf module (no interpolation import)
// so they stay bundleable in a harness. The Wiggler is seeded (house mulberry32) → the OUTPUT is
// static, deterministic keyframe data, re-runnable and frame-pure.

const isVec = (v: number | Vec2): v is Vec2 => Array.isArray(v);

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
  const next = new Map<number, number | Vec2>();
  for (let i = 1; i < sel.length - 1; i++) {
    const p = sel[i - 1].value, c = sel[i].value, n = sel[i + 1].value;
    if (isVec(c) && isVec(p) && isVec(n)) {
      next.set(sel[i].frame, [0.25 * p[0] + 0.5 * c[0] + 0.25 * n[0], 0.25 * p[1] + 0.5 * c[1] + 0.25 * n[1]]);
    } else {
      next.set(sel[i].frame, 0.25 * (p as number) + 0.5 * (c as number) + 0.25 * (n as number));
    }
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
    let value: number | Vec2;
    if (isVec(startV) && isVec(endV)) value = [geo(startV[0], endV[0], t), geo(startV[1], endV[1], t)];
    else value = geo(startV as number, endV as number, t);
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
  const next = new Map<number, number | Vec2>();
  for (let i = 1; i < sel.length - 1; i++) {
    const k = sel[i];
    const rng = mulberry32(hash2(seed, k.frame));
    const noise = () => (rng() * 2 - 1) * amplitude;
    if (isVec(k.value)) next.set(k.frame, [k.value[0] + noise(), k.value[1] + noise()]);
    else next.set(k.frame, (k.value as number) + noise());
  }
  return kfs.map((k) => (next.has(k.frame) ? { ...k, value: next.get(k.frame)! } : k));
}
