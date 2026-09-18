// Smart Crop - pure crop solver (leaf module, no imports). Given detected focal regions (faces,
// subjects, saliency) and a target aspect ratio, it fits the largest rectangle of that ratio inside
// the source, generates candidate positions, scores each, and returns the best. Analysis is done
// ONCE by the caller (see analyze.ts) and passed in as `regions`; switching ratios just re-solves
// from the same regions - never re-detects. All geometry is deterministic and unit-testable.

/** A detected focal region, in NORMALIZED image coordinates ([0,1], origin top-left). */
export interface Region {
  x: number; y: number; w: number; h: number;
  kind: 'face' | 'subject' | 'saliency';
  /** Importance in [0,1] (e.g. detector confidence, or normalized saliency mass). */
  weight: number;
}

export interface CropWeights {
  face: number;
  subject: number;
  saliency: number;
  composition: number;
  /** Penalty for cutting through an important region at the crop boundary. */
  edgeCut: number;
  /** Penalty for zooming in tighter than the maximum fit. */
  zoom: number;
}

// Tunable internally; a face outranks a person outranks saliency (per the design brief).
export const DEFAULT_WEIGHTS: CropWeights = { face: 100, subject: 70, saliency: 50, composition: 20, edgeCut: 100, zoom: 30 };

export type FocusMode = 'auto' | 'face' | 'subject' | 'center';
export type CompositionMode = 'center' | 'thirds' | 'preserve' | 'auto';
export type ConfidenceTier = 'high' | 'medium' | 'low';

/** A crop rectangle in SOURCE PIXELS. */
export interface CropRect { x: number; y: number; w: number; h: number }

export interface CropResult {
  rect: CropRect;
  ratio: number;
  score: number;
  confidence: number;
  tier: ConfidenceTier;
}

export interface SolveOptions {
  focus?: FocusMode;
  composition?: CompositionMode;
  weights?: CropWeights;
  /** Number of candidate positions along the free axis (>= 2). */
  steps?: number;
  /** 0.5..1.5 - expand (>1) or tighten (<1) the fitted crop around subjects. 1 = max fit. */
  tightness?: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const EPS = 1e-6;

/**
 * Parse an aspect specification into a numeric ratio (width / height):
 * "16:9" | "2.39:1" | "1920x1080" | "1920×1080" | a bare number. Returns null if unparseable or <= 0.
 */
export function parseAspect(input: string | number): number | null {
  if (typeof input === 'number') return input > 0 && isFinite(input) ? input : null;
  const s = input.trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const a = parseFloat(m[1]); const b = parseFloat(m[2]);
    if (a > 0 && b > 0) return a / b;
    return null;
  }
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? n : null;
}

/** Largest rectangle of aspect `ratio` (w/h) that fits inside srcW x srcH. */
export function fitAspectRect(srcW: number, srcH: number, ratio: number): { w: number; h: number } {
  if (srcW <= 0 || srcH <= 0 || ratio <= 0) return { w: 0, h: 0 };
  // Try full width first; if it overflows height, fit to height instead.
  let w = srcW;
  let h = w / ratio;
  if (h > srcH) { h = srcH; w = h * ratio; }
  return { w: Math.min(srcW, w), h: Math.min(srcH, h) };
}

/** Fraction of `region`'s area that lies inside `crop` (both in source pixels). 0..1. */
function overlapFraction(region: CropRect, crop: CropRect): number {
  const rArea = region.w * region.h;
  if (rArea <= EPS) return 0;
  const ix = Math.max(region.x, crop.x);
  const iy = Math.max(region.y, crop.y);
  const ax = Math.min(region.x + region.w, crop.x + crop.w);
  const ay = Math.min(region.y + region.h, crop.y + crop.h);
  const iw = ax - ix; const ih = ay - iy;
  if (iw <= 0 || ih <= 0) return 0;
  return (iw * ih) / rArea;
}

const toPx = (r: Region, srcW: number, srcH: number): CropRect => ({ x: r.x * srcW, y: r.y * srcH, w: r.w * srcW, h: r.h * srcH });
const centerOf = (r: CropRect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Which region kinds count for the given focus mode. */
function kindFilter(focus: FocusMode): (r: Region) => boolean {
  switch (focus) {
    case 'face': return (r) => r.kind === 'face';
    case 'subject': return (r) => r.kind === 'face' || r.kind === 'subject';
    case 'center': return () => false; // ignore all regions - pure centered crop
    case 'auto':
    default: return () => true;
  }
}

/** Weighted mean coverage of a region set by a crop (0..1). Empty set → 0. */
function weightedCoverage(regions: Region[], srcW: number, srcH: number, crop: CropRect): number {
  let num = 0; let den = 0;
  for (const r of regions) { const f = overlapFraction(toPx(r, srcW, srcH), crop); num += r.weight * f; den += r.weight; }
  return den > EPS ? num / den : 0;
}

/** Weighted mean of the CUT fraction (portion of a partially-overlapping region left outside). */
function edgeCutPenalty(regions: Region[], srcW: number, srcH: number, crop: CropRect): number {
  let num = 0; let den = 0;
  for (const r of regions) {
    const f = overlapFraction(toPx(r, srcW, srcH), crop);
    if (f > EPS && f < 1) { num += r.weight * (1 - f); den += r.weight; } // only partial cuts count
  }
  return den > EPS ? num / den : 0;
}

/** The primary subject region (prefer faces, then weight*area), for composition scoring. */
function primarySubject(regions: Region[]): Region | null {
  let best: Region | null = null; let bestScore = -1;
  for (const r of regions) {
    const kindBoost = r.kind === 'face' ? 2 : r.kind === 'subject' ? 1 : 0.3;
    const s = r.weight * (r.w * r.h) * kindBoost;
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return best;
}

/** Composition quality (0..1) for where the primary subject lands in the crop. */
function compositionScore(subject: Region | null, srcW: number, srcH: number, crop: CropRect, mode: CompositionMode): number {
  if (!subject) {
    // No subject to frame (center focus, or nothing detected): prefer a crop centred in the source.
    const cc = centerOf(crop);
    const dx = Math.abs(cc.x / Math.max(EPS, srcW) - 0.5);
    const dy = Math.abs(cc.y / Math.max(EPS, srcH) - 0.5);
    return clamp(1 - (dx + dy), 0, 1);
  }
  const sc = centerOf(toPx(subject, srcW, srcH));
  // subject centre in crop-local normalized coords
  const lx = clamp((sc.x - crop.x) / Math.max(EPS, crop.w), 0, 1);
  const ly = clamp((sc.y - crop.y) / Math.max(EPS, crop.h), 0, 1);
  const centerScore = 1 - (Math.abs(lx - 0.5) + Math.abs(ly - 0.5)); // 1 at centre
  const thirdsDist = Math.min(
    Math.hypot(lx - 1 / 3, ly - 1 / 3), Math.hypot(lx - 2 / 3, ly - 1 / 3),
    Math.hypot(lx - 1 / 3, ly - 2 / 3), Math.hypot(lx - 2 / 3, ly - 2 / 3),
  );
  const thirdsScore = 1 - clamp(thirdsDist / 0.6, 0, 1);
  // preserve: subject stays where it was in the source frame
  const ox = clamp(sc.x / Math.max(EPS, srcW), 0, 1);
  const oy = clamp(sc.y / Math.max(EPS, srcH), 0, 1);
  const preserveScore = 1 - (Math.abs(lx - ox) + Math.abs(ly - oy));
  switch (mode) {
    case 'center': return clamp(centerScore, 0, 1);
    case 'thirds': return clamp(thirdsScore, 0, 1);
    case 'preserve': return clamp(preserveScore, 0, 1);
    case 'auto':
    default: return clamp(0.5 * centerScore + 0.5 * thirdsScore, 0, 1);
  }
}

/** Score a single candidate crop. Higher is better. */
export function scoreCrop(
  crop: CropRect, srcW: number, srcH: number, regions: Region[],
  focus: FocusMode, composition: CompositionMode, weights: CropWeights, maxFitArea: number,
): number {
  const keep = regions.filter(kindFilter(focus));
  const faces = keep.filter((r) => r.kind === 'face');
  const subjects = keep.filter((r) => r.kind === 'subject');
  const sal = keep.filter((r) => r.kind === 'saliency');
  const important = keep.filter((r) => r.kind === 'face' || r.kind === 'subject');

  const faceCov = weightedCoverage(faces, srcW, srcH, crop);
  const subjCov = weightedCoverage(subjects, srcW, srcH, crop);
  const salCov = weightedCoverage(sal, srcW, srcH, crop);
  const comp = compositionScore(primarySubject(keep), srcW, srcH, crop, composition);
  const cut = edgeCutPenalty(important, srcW, srcH, crop);
  const zoom = maxFitArea > EPS ? clamp(1 - (crop.w * crop.h) / maxFitArea, 0, 1) : 0;

  return weights.face * faceCov
    + weights.subject * subjCov
    + weights.saliency * salCov
    + weights.composition * comp
    - weights.edgeCut * cut
    - weights.zoom * zoom;
}

function tierFor(confidence: number): ConfidenceTier {
  return confidence >= 0.75 ? 'high' : confidence >= 0.45 ? 'medium' : 'low';
}

/** Solve the best crop of `ratio` (w/h) for the source, given detected regions. */
export function solveCrop(srcW: number, srcH: number, ratio: number, regions: Region[], opts: SolveOptions = {}): CropResult {
  const focus = opts.focus ?? 'auto';
  const composition = opts.composition ?? 'auto';
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const steps = Math.max(2, Math.floor(opts.steps ?? 41));
  const tightness = clamp(opts.tightness ?? 1, 0.5, 1.5);

  const fit = fitAspectRect(srcW, srcH, ratio);
  const maxFitArea = fit.w * fit.h;
  // Tightness < 1 shrinks the crop (tighter framing); clamp so it still fits.
  const cw = clamp(fit.w * tightness, 1, srcW);
  const ch = clamp(fit.h * tightness, 1, srcH);
  const freeX = Math.max(0, srcW - cw);
  const freeY = Math.max(0, srcH - ch);

  let best: CropRect = { x: freeX / 2, y: freeY / 2, w: cw, h: ch };
  let bestScore = -Infinity;
  // Search the 2D grid of positions (one axis is usually zero-length for a max-fit crop).
  const nx = freeX > EPS ? steps : 1;
  const ny = freeY > EPS ? steps : 1;
  for (let iy = 0; iy < ny; iy++) {
    const y = ny > 1 ? (iy / (ny - 1)) * freeY : freeY / 2;
    for (let ix = 0; ix < nx; ix++) {
      const x = nx > 1 ? (ix / (nx - 1)) * freeX : freeX / 2;
      const crop = { x, y, w: cw, h: ch };
      const s = scoreCrop(crop, srcW, srcH, regions, focus, composition, weights, maxFitArea);
      if (s > bestScore) { bestScore = s; best = crop; }
    }
  }

  // Confidence from how strongly the best crop covers real subjects.
  const keep = regions.filter(kindFilter(focus));
  const faceCov = weightedCoverage(keep.filter((r) => r.kind === 'face'), srcW, srcH, best);
  const subjCov = weightedCoverage(keep.filter((r) => r.kind === 'subject'), srcW, srcH, best);
  const salCov = weightedCoverage(keep.filter((r) => r.kind === 'saliency'), srcW, srcH, best);
  const hasFace = keep.some((r) => r.kind === 'face');
  const hasSubject = keep.some((r) => r.kind === 'subject');
  const confidence = clamp(
    (hasFace ? 0.35 + 0.55 * faceCov : hasSubject ? 0.25 + 0.45 * subjCov : 0.15 + 0.35 * salCov),
    0, 1,
  );

  return {
    rect: { x: Math.round(best.x), y: Math.round(best.y), w: Math.round(best.w), h: Math.round(best.h) },
    ratio, score: bestScore, confidence, tier: tierFor(confidence),
  };
}

/** Solve several ratios from the SAME regions (the "Generate variants" feature - one analysis). */
export function solveVariants(srcW: number, srcH: number, ratios: number[], regions: Region[], opts: SolveOptions = {}): CropResult[] {
  return ratios.map((r) => solveCrop(srcW, srcH, r, regions, opts));
}

/** Bounding box (normalized) enclosing all face/subject regions - for multi-subject "keep both". */
export function groupBox(regions: Region[]): Region | null {
  const subj = regions.filter((r) => r.kind === 'face' || r.kind === 'subject');
  if (subj.length === 0) return null;
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, w = 0;
  for (const r of subj) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); w = Math.max(w, r.weight); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'subject', weight: w };
}

/** Can the target ratio contain the whole subject group (so "keep both" is viable)? */
export function groupFits(srcW: number, srcH: number, ratio: number, regions: Region[]): boolean {
  const g = groupBox(regions);
  if (!g) return true;
  const fit = fitAspectRect(srcW, srcH, ratio);
  return g.w * srcW <= fit.w + EPS && g.h * srcH <= fit.h + EPS;
}
