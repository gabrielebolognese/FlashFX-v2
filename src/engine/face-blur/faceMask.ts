// Face Blur - pure geometry + normalization (leaf module, no imports). Turns detected face boxes into
// blur/pixelate/solid mask regions with resolution-relative strength (so "72" means the same visual
// amount on a 500px and a 6000px image), coverage (shrink/expand the mask past the detected box for
// hair/ears), and feather. Also the selection helpers (auto-select by confidence, relevance by size,
// invert). The actual pixel treatment is browser 2D-canvas work (see treatment.ts); this math is
// deterministic + unit-testable (verify:face-mask).

/** A detected (or manually added) face, in NORMALIZED image coords ([0,1], origin top-left). */
export interface FaceBox {
  id: string;
  x: number; y: number; w: number; h: number;
  /** Detector confidence [0,1]; manual regions use 1. */
  confidence: number;
  /** True for a user-drawn region (never auto-filtered out). */
  manual?: boolean;
}

export type Treatment = 'gaussian' | 'pixelate' | 'solid';

export interface MaskEllipse { cx: number; cy: number; rx: number; ry: number }
export interface Rect { x: number; y: number; w: number; h: number }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const minSide = (w: number, h: number) => Math.max(1, Math.min(w, h));

// Tunable internally. Strength/coverage/feather are all resolution-normalized against the short side.
const BLUR_MAX_FRAC = 0.06;   // strength 100 -> 6% of the short side
const PIXEL_MAX_FRAC = 0.05;  // strength 100 -> 5% block, capped below
const FEATHER_MAX_FRAC = 0.04;

/** Ellipse mask (in SOURCE PIXELS) for a face box, scaled by coverage (0.5..1.5; 1 = the box). */
export function ellipseMask(box: FaceBox, srcW: number, srcH: number, coverage: number): MaskEllipse {
  const cov = clamp(coverage, 0.5, 1.5);
  const cx = (box.x + box.w / 2) * srcW;
  const cy = (box.y + box.h / 2) * srcH;
  const rx = (box.w / 2) * srcW * cov;
  const ry = (box.h / 2) * srcH * cov;
  return { cx, cy, rx: Math.max(1, rx), ry: Math.max(1, ry) };
}

/** Axis-aligned covered rect (in SOURCE PIXELS) for solid redaction, scaled by coverage. */
export function coveredRect(box: FaceBox, srcW: number, srcH: number, coverage: number): Rect {
  const cov = clamp(coverage, 0.5, 1.5);
  const cx = (box.x + box.w / 2) * srcW;
  const cy = (box.y + box.h / 2) * srcH;
  const w = box.w * srcW * cov;
  const h = box.h * srcH * cov;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Resolution-relative gaussian blur radius (px) for a strength [0..100]. */
export function blurRadiusPx(strength: number, srcW: number, srcH: number): number {
  const s = clamp(strength, 0, 100) / 100;
  return Math.max(1, Math.round(s * BLUR_MAX_FRAC * minSide(srcW, srcH)));
}

/** Resolution-relative pixelation block size (px) for a strength [0..100]. */
export function pixelBlockPx(strength: number, srcW: number, srcH: number): number {
  const s = clamp(strength, 0, 100) / 100;
  const ms = minSide(srcW, srcH);
  return Math.round(clamp(s * PIXEL_MAX_FRAC * ms, 2, ms / 6));
}

/** Resolution-relative feather radius (px) for a feather amount [0..100]. */
export function featherPx(feather: number, srcW: number, srcH: number): number {
  const f = clamp(feather, 0, 100) / 100;
  return Math.max(0, Math.round(f * FEATHER_MAX_FRAC * minSide(srcW, srcH)));
}

/** Face area as a fraction of the image (for relevance / small-face filtering). */
export function faceAreaFraction(box: FaceBox): number {
  return clamp(box.w, 0, 1) * clamp(box.h, 0, 1);
}

/**
 * Split detections into "relevant" (large/confident enough to matter) and the rest, per the brief
 * ("12 faces detected, 3 likely relevant"). Manual regions are always relevant. `minSizeFrac` is the
 * min short-side fraction a face must span to count.
 */
export function relevantFaces(faces: FaceBox[], minSizeFrac = 0.04, minConfidence = 0.5): { relevant: FaceBox[]; minor: FaceBox[] } {
  const relevant: FaceBox[] = []; const minor: FaceBox[] = [];
  for (const f of faces) {
    const bigEnough = Math.min(f.w, f.h) >= minSizeFrac;
    const confident = f.confidence >= minConfidence;
    if (f.manual || (bigEnough && confident)) relevant.push(f); else minor.push(f);
  }
  return { relevant, minor };
}

/** Ids of faces to auto-select on open: high-confidence, relevant faces (not the uncertain/tiny ones). */
export function autoSelect(faces: FaceBox[], threshold = 0.7, minSizeFrac = 0.04): string[] {
  return faces.filter((f) => f.manual || (f.confidence >= threshold && Math.min(f.w, f.h) >= minSizeFrac)).map((f) => f.id);
}

/** Invert a selection over the full id set. */
export function invertSelection(selected: string[], allIds: string[]): string[] {
  const set = new Set(selected);
  return allIds.filter((id) => !set.has(id));
}

export type ConfidenceTier = 'high' | 'medium' | 'low';
export function confidenceTier(confidence: number): ConfidenceTier {
  return confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
}
