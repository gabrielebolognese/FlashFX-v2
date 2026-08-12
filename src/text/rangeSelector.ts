// The per-unit RANGE SELECTOR — the frame-pure weight primitive the text system was missing.
//
// This is the unifying abstraction from After Effects (animator range selector) and Cavalry
// (stagger falloff): given a unit index in a range, produce a weight that a driven property
// blends by (`value = base + delta * weight`). It intentionally has NO dependency on text,
// clones or particles — any per-unit animation composes on it. Pure and deterministic (a seeded
// house RNG for randomize-order), so it can be evaluated non-sequentially and stays byte-stable.

export type SelectorShape = 'square' | 'rampUp' | 'rampDown' | 'triangle' | 'round' | 'smooth';

export interface RangeSelectorConfig {
  /** Window edges over the unit range, as fractions 0..1 of the count. */
  start: number;
  end: number;
  /** Shifts the whole [start, end] window; this is the value you keyframe for a reveal. */
  offset: number;
  /** Falloff profile inside the window. */
  shape: SelectorShape;
  /** Reshape the approach to full/none selection, -1..1 (AE Ease High / Ease Low). */
  easeHigh: number;
  easeLow: number;
  /** Scales the selector's contribution, -1..1 (negative inverts the effect). */
  amount: number;
  /** Shuffle which unit maps to which position in the window (scatter reveal). */
  randomizeOrder: boolean;
  seed: number;
}

export function defaultRangeSelector(): RangeSelectorConfig {
  return {
    start: 0,
    end: 1,
    offset: 0,
    shape: 'rampUp',
    easeHigh: 0,
    easeLow: 0,
    amount: 1,
    randomizeOrder: false,
    seed: 1,
  };
}

// House mulberry32 (same algorithm as the copies in cloner/particles/procedural) — frame-pure.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const clampSigned = (x: number): number => (x < -1 ? -1 : x > 1 ? 1 : x);

/** Shape the base ramp of the window at normalized position t (0 at start edge, 1 at end edge). */
function shapeAt(shape: SelectorShape, t: number): number {
  const u = clamp01(t);
  switch (shape) {
    case 'square': return t > 0 && t < 1 ? 1 : t <= 0 ? 0 : 1; // 1 across the window interior
    case 'rampUp': return u;
    case 'rampDown': return 1 - u;
    case 'triangle': return 1 - Math.abs(2 * u - 1);
    case 'round': return Math.sqrt(1 - (1 - u) * (1 - u)); // circular ease-out ramp
    case 'smooth': return u * u * (3 - 2 * u); // smoothstep
    default: return u;
  }
}

/** Apply Ease Low / Ease High as endpoint-preserving gamma on the low and high ends. */
function applyEase(v: number, easeLow: number, easeHigh: number): number {
  let x = clamp01(v);
  if (easeLow !== 0) x = Math.pow(x, Math.pow(3, clampSigned(easeLow)));
  if (easeHigh !== 0) x = 1 - Math.pow(1 - x, Math.pow(3, clampSigned(easeHigh)));
  return x;
}

/** Weight for a single unit position p (0..1) under the config. Signed (amount can invert). */
function weightAtPosition(p: number, cfg: RangeSelectorConfig): number {
  const winStart = cfg.start + cfg.offset;
  const winEnd = cfg.end + cfg.offset;
  const span = winEnd - winStart;
  let t: number;
  if (span === 0) {
    t = p < winStart ? 0 : p > winStart ? 1 : 1;
  } else if (span > 0) {
    if (p <= winStart) t = 0;
    else if (p >= winEnd) t = 1;
    else t = (p - winStart) / span;
  } else {
    // Inverted window (offset pushed end before start): mirror.
    if (p >= winStart) t = 0;
    else if (p <= winEnd) t = 1;
    else t = (winStart - p) / -span;
  }
  const base = applyEase(shapeAt(cfg.shape, t), cfg.easeLow, cfg.easeHigh);
  return base * clampSigned(cfg.amount);
}

/**
 * The full weight array for `count` units. Each unit i sits at position i/(count-1) (or a
 * seeded-permuted position when randomizeOrder is on), then weighted by the config. Values are
 * signed in [-1, 1]; with the default amount=1 they are in [0, 1].
 */
export function selectorWeights(count: number, cfg: RangeSelectorConfig): number[] {
  if (count <= 0) return [];
  // Position order — a seeded Fisher-Yates permutation when scattering.
  const order = Array.from({ length: count }, (_, i) => i);
  if (cfg.randomizeOrder && count > 1) {
    const rng = mulberry32(cfg.seed >>> 0);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
  }
  const out = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const p = count === 1 ? 0 : order[i] / (count - 1);
    out[i] = weightAtPosition(p, cfg);
  }
  return out;
}

/** Convenience: the weight of a single unit (rebuilds the permutation; prefer selectorWeights for many). */
export function selectorWeight(index: number, count: number, cfg: RangeSelectorConfig): number {
  return selectorWeights(count, cfg)[index] ?? 0;
}
