// Named easing functions - the "premium" temporal eases (After Effects / Robert Penner vocabulary).
//
// These are the shapes a single cubic-bezier CANNOT represent - true elastic wobble, decaying
// bounce, and back/overshoot - plus the full smooth Penner family. Each is a PURE `(t) => value`
// mapping on the normalized segment domain t∈[0,1]. Non-overshoot eases stay in [0,1]; `back` and
// `elastic` deliberately go slightly past 0/1 (that is the overshoot), but every ease still starts
// at exactly 0 (t=0) and ends at exactly 1 (t=1) so segments join cleanly.
//
// This module has NO imports on purpose: it is the leaf dependency shared by the renderer
// (core/interpolation.ts), the graph editor, and the verify harness, and must stay trivially
// bundleable in Node (no DOM/Worker deps anywhere in its import graph).

export type EasingName =
  | 'linear'
  | 'sineIn' | 'sineOut' | 'sineInOut'
  | 'quadIn' | 'quadOut' | 'quadInOut'
  | 'cubicIn' | 'cubicOut' | 'cubicInOut'
  | 'quartIn' | 'quartOut' | 'quartInOut'
  | 'quintIn' | 'quintOut' | 'quintInOut'
  | 'expoIn' | 'expoOut' | 'expoInOut'
  | 'circIn' | 'circOut' | 'circInOut'
  | 'backIn' | 'backOut' | 'backInOut'
  | 'elasticIn' | 'elasticOut' | 'elasticInOut'
  | 'bounceIn' | 'bounceOut' | 'bounceInOut';

const PI = Math.PI;

// Power family (quad=2, cubic=3, quart=4, quint=5).
const powIn = (t: number, p: number) => Math.pow(t, p);
const powOut = (t: number, p: number) => 1 - Math.pow(1 - t, p);
const powInOut = (t: number, p: number) =>
  t < 0.5 ? Math.pow(2, p - 1) * Math.pow(t, p) : 1 - Math.pow(-2 * t + 2, p) / 2;

// Back (overshoot) constants - the classic Penner values.
const BACK_C1 = 1.70158;
const BACK_C2 = BACK_C1 * 1.525;
const BACK_C3 = BACK_C1 + 1;

// Elastic oscillation periods.
const ELASTIC_C4 = (2 * PI) / 3;
const ELASTIC_C5 = (2 * PI) / 4.5;

// Bounce constants.
const BOUNCE_N1 = 7.5625;
const BOUNCE_D1 = 2.75;
function bounceOut(t: number): number {
  if (t < 1 / BOUNCE_D1) return BOUNCE_N1 * t * t;
  if (t < 2 / BOUNCE_D1) { t -= 1.5 / BOUNCE_D1; return BOUNCE_N1 * t * t + 0.75; }
  if (t < 2.5 / BOUNCE_D1) { t -= 2.25 / BOUNCE_D1; return BOUNCE_N1 * t * t + 0.9375; }
  t -= 2.625 / BOUNCE_D1;
  return BOUNCE_N1 * t * t + 0.984375;
}

export const EASINGS: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,

  sineIn: (t) => 1 - Math.cos((t * PI) / 2),
  sineOut: (t) => Math.sin((t * PI) / 2),
  sineInOut: (t) => -(Math.cos(PI * t) - 1) / 2,

  quadIn: (t) => powIn(t, 2),
  quadOut: (t) => powOut(t, 2),
  quadInOut: (t) => powInOut(t, 2),

  cubicIn: (t) => powIn(t, 3),
  cubicOut: (t) => powOut(t, 3),
  cubicInOut: (t) => powInOut(t, 3),

  quartIn: (t) => powIn(t, 4),
  quartOut: (t) => powOut(t, 4),
  quartInOut: (t) => powInOut(t, 4),

  quintIn: (t) => powIn(t, 5),
  quintOut: (t) => powOut(t, 5),
  quintInOut: (t) => powInOut(t, 5),

  expoIn: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  expoOut: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoInOut: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,

  circIn: (t) => 1 - Math.sqrt(1 - Math.pow(t, 2)),
  circOut: (t) => Math.sqrt(1 - Math.pow(t - 1, 2)),
  circInOut: (t) =>
    t < 0.5
      ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
      : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,

  backIn: (t) => BACK_C3 * t * t * t - BACK_C1 * t * t,
  backOut: (t) => 1 + BACK_C3 * Math.pow(t - 1, 3) + BACK_C1 * Math.pow(t - 1, 2),
  backInOut: (t) =>
    t < 0.5
      ? (Math.pow(2 * t, 2) * ((BACK_C2 + 1) * 2 * t - BACK_C2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((BACK_C2 + 1) * (t * 2 - 2) + BACK_C2) + 2) / 2,

  elasticIn: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ELASTIC_C4),
  elasticOut: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1,
  elasticInOut: (t) =>
    t === 0
      ? 0
      : t === 1
        ? 1
        : t < 0.5
          ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2
          : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ELASTIC_C5)) / 2 + 1,

  bounceIn: (t) => 1 - bounceOut(1 - t),
  bounceOut: (t) => bounceOut(t),
  bounceInOut: (t) =>
    t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2,
};

/** Apply a named ease at t (t is clamped to [0,1]). Unknown names fall back to linear - never throws. */
export function applyEasing(name: EasingName | string | undefined, t: number): number {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const fn = name ? (EASINGS as Record<string, (t: number) => number>)[name] : undefined;
  return fn ? fn(tt) : tt;
}

/**
 * Cubic-bezier easing solver (CSS `cubic-bezier(p1x,p1y,p2x,p2y)` semantics): given the two control
 * points of a normalized [0,1]² curve, return eased y for input x=t. Newton-Raphson on x, then
 * sample y. Shared by the renderer and the graph editor so a bezier segment reads identically in
 * both. Pure, no deps.
 */
export function cubicBezier(t: number, p1x: number, p1y: number, p2x: number, p2y: number): number {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const sampleX = (tt: number) => ((ax * tt + bx) * tt + cx) * tt;
  const sampleY = (tt: number) => ((ay * tt + by) * tt + cy) * tt;

  let x = t;
  for (let i = 0; i < 8; i++) {
    const currentX = sampleX(x) - t;
    if (Math.abs(currentX) < 1e-7) return sampleY(x);
    const dx = (3 * ax * x + 2 * bx) * x + cx;
    if (Math.abs(dx) < 1e-7) break;
    x -= currentX / dx;
  }
  return sampleY(x);
}

/** Fixed damped-cosine spring progress (the legacy `spring` interpolation type). */
export function springProgress(t: number): number {
  const damping = 0.7;
  const frequency = 4;
  return 1 - Math.exp(-damping * t * 10) * Math.cos(frequency * t * Math.PI * 2);
}
