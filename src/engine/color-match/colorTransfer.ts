// Color Match - reference-based color transfer (pure leaf module, no imports). Matches a target's
// tonal + chromatic CHARACTER to a reference (not its pixels) via statistical transfer in OKLab: shift
// + scale each target channel so its mean/std move toward the reference's (Reinhard color transfer),
// interpolated by match strength, with skin/neutral protection so a teal/orange reference doesn't turn
// skin or white walls strange. All math here is deterministic + unit-testable (verify:color-transfer);
// the per-pixel apply + UI are browser-gated.

export interface OkLab { L: number; a: number; b: number }
export interface ChannelStats { mean: number; std: number }
export interface LabStats { L: ChannelStats; a: ChannelStats; b: ChannelStats; count: number }
export type MatchMode = 'natural' | 'creative' | 'exact';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const cbrt = Math.cbrt;

// ── sRGB <-> linear <-> OKLab ────────────────────────────────────────────────────────────────────

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Linear-sRGB (0..1) -> OKLab. */
export function linearRgbToOklab(r: number, g: number, b: number): OkLab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = cbrt(l), m_ = cbrt(m), s_ = cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

/** OKLab -> linear sRGB (0..1, unclamped). */
export function oklabToLinearRgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

/** sRGB (0..255) -> OKLab. */
export function srgb8ToOklab(r: number, g: number, b: number): OkLab {
  return linearRgbToOklab(srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255));
}
/** OKLab -> sRGB (0..255, clamped). */
export function oklabToSrgb8(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const lin = oklabToLinearRgb(L, a, b);
  return {
    r: Math.round(clamp(linearToSrgb(clamp(lin.r, 0, 1)), 0, 1) * 255),
    g: Math.round(clamp(linearToSrgb(clamp(lin.g, 0, 1)), 0, 1) * 255),
    b: Math.round(clamp(linearToSrgb(clamp(lin.b, 0, 1)), 0, 1) * 255),
  };
}

// ── Statistics ───────────────────────────────────────────────────────────────────────────────────

/** Per-channel OKLab mean + std over an RGBA pixel buffer (skips near-transparent pixels). */
export function analyzePixels(rgba: Uint8ClampedArray | number[]): LabStats {
  let n = 0, sumL = 0, sumA = 0, sumB = 0, sumL2 = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 8) continue;
    const c = srgb8ToOklab(rgba[i], rgba[i + 1], rgba[i + 2]);
    n++; sumL += c.L; sumA += c.a; sumB += c.b; sumL2 += c.L * c.L; sumA2 += c.a * c.a; sumB2 += c.b * c.b;
  }
  const stat = (sum: number, sum2: number): ChannelStats => {
    if (n === 0) return { mean: 0, std: 0 };
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
  };
  return { L: stat(sumL, sumL2), a: stat(sumA, sumA2), b: stat(sumB, sumB2), count: n };
}

/** Weighted combination of several reference analyses (the multi-reference "combined look"). */
export function combineStats(list: { stats: LabStats; weight: number }[]): LabStats {
  const valid = list.filter((x) => x.weight > 0 && x.stats.count > 0);
  if (valid.length === 0) return { L: { mean: 0, std: 0 }, a: { mean: 0, std: 0 }, b: { mean: 0, std: 0 }, count: 0 };
  let tw = 0; const acc = { Lm: 0, Ls: 0, am: 0, as: 0, bm: 0, bs: 0 };
  for (const { stats, weight } of valid) {
    tw += weight;
    acc.Lm += stats.L.mean * weight; acc.Ls += stats.L.std * weight;
    acc.am += stats.a.mean * weight; acc.as += stats.a.std * weight;
    acc.bm += stats.b.mean * weight; acc.bs += stats.b.std * weight;
  }
  return {
    L: { mean: acc.Lm / tw, std: acc.Ls / tw },
    a: { mean: acc.am / tw, std: acc.as / tw },
    b: { mean: acc.bm / tw, std: acc.bs / tw },
    count: valid.reduce((s, x) => s + x.stats.count, 0),
  };
}

// ── Transform ────────────────────────────────────────────────────────────────────────────────────

export interface Transform { scaleL: number; offL: number; scaleA: number; offA: number; scaleB: number; offB: number }

// Per-mode clamps on how far the transfer can push (chroma scale range, and how hard a/b shift).
const MODE_LIMITS: Record<MatchMode, { lScale: [number, number]; cScale: [number, number]; abShift: number }> = {
  natural: { lScale: [0.75, 1.35], cScale: [0.7, 1.4], abShift: 0.6 },
  creative: { lScale: [0.6, 1.7], cScale: [0.5, 1.9], abShift: 0.85 },
  exact: { lScale: [0.4, 2.5], cScale: [0.3, 3.0], abShift: 1 },
};

const safeScale = (num: number, den: number, lo: number, hi: number) => clamp(den > 1e-5 ? num / den : 1, lo, hi);

/** Build the Reinhard scale/offset per channel that maps target stats toward reference stats. */
export function buildTransform(target: LabStats, ref: LabStats, mode: MatchMode = 'natural'): Transform {
  const lim = MODE_LIMITS[mode];
  const sL = safeScale(ref.L.std, target.L.std, lim.lScale[0], lim.lScale[1]);
  const sA = safeScale(ref.a.std, target.a.std, lim.cScale[0], lim.cScale[1]);
  const sB = safeScale(ref.b.std, target.b.std, lim.cScale[0], lim.cScale[1]);
  // offset so mean maps target->ref; the a/b mean shift is scaled by the mode's abShift.
  const offL = ref.L.mean - sL * target.L.mean;
  const offA = (ref.a.mean - sA * target.a.mean) * lim.abShift;
  const offB = (ref.b.mean - sB * target.b.mean) * lim.abShift;
  return { scaleL: sL, offL, scaleA: sA, offA, scaleB: sB, offB };
}

/**
 * Soft protection factor [0..1] (1 = leave this colour alone). Neutrals = low chroma; skin = a warm
 * OKLab hue wedge at moderate chroma + mid lightness. Both are opt-in via `opts`.
 */
export function protectionFactor(lab: OkLab, opts: { skin: boolean; neutral: boolean; skinAmount?: number; neutralAmount?: number }): number {
  const chroma = Math.hypot(lab.a, lab.b);
  let p = 0;
  if (opts.neutral) {
    // near-grey -> strong protection, fading out by chroma ~0.05
    const neutral = 1 - clamp(chroma / 0.05, 0, 1);
    p = Math.max(p, neutral * (opts.neutralAmount ?? 1));
  }
  if (opts.skin) {
    const hue = Math.atan2(lab.b, lab.a); // radians
    const hueOk = hue > 0.15 && hue < 1.1; // ~9deg..63deg, warm wedge
    const chromaOk = chroma > 0.02 && chroma < 0.18;
    const lightOk = lab.L > 0.35 && lab.L < 0.9;
    if (hueOk && chromaOk && lightOk) {
      // membership peaks mid-wedge
      const hueW = 1 - Math.abs(hue - 0.6) / 0.5;
      p = Math.max(p, clamp(hueW, 0, 1) * (opts.skinAmount ?? 1));
    }
  }
  return clamp(p, 0, 1);
}

/** Apply the transform to one OKLab colour, at `strength` [0..1], reduced by per-pixel `protection`. */
export function applyTransform(lab: OkLab, t: Transform, strength: number, protection = 0): OkLab {
  const eff = clamp(strength, 0, 1) * (1 - clamp(protection, 0, 1));
  const nL = t.scaleL * lab.L + t.offL;
  const nA = t.scaleA * lab.a + t.offA;
  const nB = t.scaleB * lab.b + t.offB;
  return { L: lab.L + (nL - lab.L) * eff, a: lab.a + (nA - lab.a) * eff, b: lab.b + (nB - lab.b) * eff };
}

// ── UI readout (display-only interpretation of the stats delta) ────────────────────────────────────

export interface AutoReadout { exposure: number; temperature: number; tint: number; contrast: number; saturation: number }

/** Human-readable auto-correction values implied by the target->reference stats delta. */
export function autoReadout(target: LabStats, ref: LabStats): AutoReadout {
  const exposure = +(((ref.L.mean - target.L.mean)) * 6).toFixed(1); // ~stops; OKLab L is ~0..1
  const temperature = Math.round((ref.b.mean - target.b.mean) * 200); // b = yellow(+)/blue(-)
  const tint = Math.round((ref.a.mean - target.a.mean) * 200);        // a = magenta(+)/green(-)
  const contrast = Math.round((safeScale(ref.L.std, target.L.std, 0.3, 3) - 1) * 100);
  const tChroma = (target.a.std + target.b.std) / 2;
  const rChroma = (ref.a.std + ref.b.std) / 2;
  const saturation = Math.round((safeScale(rChroma, tChroma, 0.3, 3) - 1) * 100);
  return { exposure, temperature, tint, contrast, saturation };
}

/** Coarse descriptive tags for the reference "look" panel. */
export function describeLook(stats: LabStats): { temperature: string; contrast: string; saturation: string } {
  const warm = stats.b.mean;
  const chroma = (stats.a.std + stats.b.std) / 2;
  return {
    temperature: warm > 0.03 ? 'Warm' : warm < -0.03 ? 'Cool' : 'Neutral',
    contrast: stats.L.std > 0.16 ? 'High' : stats.L.std < 0.09 ? 'Low' : 'Medium',
    saturation: chroma > 0.06 ? 'High' : chroma < 0.03 ? 'Low' : 'Medium',
  };
}
