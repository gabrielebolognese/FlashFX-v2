import type { RangeSelectorConfig } from '../text/rangeSelector';
import { selectorWeights } from '../text/rangeSelector';
import type { TextAnimatorDelta, TextAnimatorSplitMode, Vec4 } from './types';

// Pure per-character text-animation core. Given the string and a set of frame-resolved animators
// (offset already baked into each selector), it produces a per-character transform/opacity delta by
// blending each animator's property deltas by its range-selector weight (value = base + delta·weight).
// No canvas, no React, no Date/Math.random - fully deterministic and unit-testable
// (scripts/verify-textanimator.mjs). Glyph PLACEMENT (x/y from canvas measurement) is a separate,
// browser-only concern handled at resolve time; this file only computes the per-index deltas.

export interface GlyphDelta {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  rotation: number;
  opacity: number;
  /** Per-character 3D out-of-plane rotation in degrees (B9c). Only used when the text layer is 3D. */
  rx: number;
  ry: number;
  /** Per-character gaussian blur radius in px (B9d), added to the layer's base blur on each stamp. */
  blur: number;
  /** Extra tracking in em after this character (summed over animators); see trackingShifts. */
  tracking: number;
  /** Horizontal skew in degrees (B36), summed over animators. */
  skew: number;
  /**
   * Fill-colour mixes (B36), in animator order: the glyph's fill = its own colour mixed towards each
   * `color` by `w` in turn (linear light, applied at resolve time where the base colour is known).
   * Absent when no fill-colour animator selects this glyph.
   */
  fills?: { color: Vec4; w: number }[];
}

/** A frame-resolved animator: selector.offset already evaluated for the current frame. */
export interface ResolvedTextAnimator {
  splitMode: TextAnimatorSplitMode;
  selector: RangeSelectorConfig;
  delta: TextAnimatorDelta;
  /** B82: explicit per-unit weights (a typing schedule) used instead of the selector. Never persisted. */
  weights?: readonly number[];
}

const identity = (): GlyphDelta => ({ tx: 0, ty: 0, sx: 1, sy: 1, rotation: 0, opacity: 1, rx: 0, ry: 0, blur: 0, tracking: 0, skew: 0 });
const isWhitespace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Map each character to its selector UNIT index (and report the unit count), per split mode:
 * - character: one unit per character (spaces included, matching AE's "Characters").
 * - characterNoSpaces: one unit per non-whitespace character (AE's "Characters Excluding Spaces");
 *   whitespace shares the unit of the character before it (leading whitespace: unit 0).
 * - word: one unit per whitespace-delimited run; whitespace attaches to the preceding word.
 * - line: one unit per '\n'-delimited line.
 */
export function splitTextUnits(content: string, mode: TextAnimatorSplitMode): { unitOf: number[]; unitCount: number } {
  const unitOf = new Array<number>(content.length);
  if (mode === 'character') {
    for (let i = 0; i < content.length; i++) unitOf[i] = i;
    return { unitOf, unitCount: content.length };
  }
  if (mode === 'characterNoSpaces') {
    let unit = -1;
    for (let i = 0; i < content.length; i++) {
      if (!isWhitespace(content[i])) unit++;
      unitOf[i] = unit < 0 ? 0 : unit;
    }
    return { unitOf, unitCount: Math.max(1, unit + 1) };
  }
  if (mode === 'line') {
    let line = 0;
    for (let i = 0; i < content.length; i++) {
      unitOf[i] = line;
      if (content[i] === '\n') line++;
    }
    return { unitOf, unitCount: line + 1 };
  }
  // word
  let word = -1;
  let inWord = false;
  for (let i = 0; i < content.length; i++) {
    if (!isWhitespace(content[i])) {
      if (!inWord) { word++; inWord = true; }
    } else {
      inWord = false;
    }
    unitOf[i] = word < 0 ? 0 : word;
  }
  return { unitOf, unitCount: Math.max(1, word + 1) };
}

/**
 * Seeded per-unit random in [-1, 1) for scatter (B36): a house mulberry32 step on a hash of
 * (seed, unit, axis). Frame-pure (no Math.random), so a scattered reveal scrubs byte-identically.
 */
export function unitRandom(seed: number, unit: number, axis: number): number {
  let a = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(unit + 1, 0x85ebca77) ^ Math.imul(axis + 1, 0xc2b2ae3d)) >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
}

/**
 * Accumulate every animator into a per-character GlyphDelta array. Positions and rotations add;
 * scale and opacity multiply. Deterministic given the same inputs.
 */
export function accumulateGlyphDeltas(content: string, animators: ResolvedTextAnimator[]): GlyphDelta[] {
  const out: GlyphDelta[] = Array.from({ length: content.length }, identity);
  for (const anim of animators) {
    const { unitOf, unitCount } = splitTextUnits(content, anim.splitMode);
    const weights = anim.weights ?? selectorWeights(unitCount, anim.selector);
    const d = anim.delta;
    for (let i = 0; i < content.length; i++) {
      const w = weights[unitOf[i]] ?? 0;
      if (w === 0) continue;
      const g = out[i];
      if (d.position) { g.tx += d.position[0] * w; g.ty += d.position[1] * w; }
      if (d.rotation) g.rotation += d.rotation * w;
      if (d.rotationX) g.rx += d.rotationX * w;
      if (d.rotationY) g.ry += d.rotationY * w;
      if (d.scale) { g.sx *= 1 + d.scale[0] * w; g.sy *= 1 + d.scale[1] * w; }
      if (d.opacity) g.opacity = clamp01(g.opacity * (1 + d.opacity * w));
      if (d.blur) g.blur = Math.max(0, g.blur + d.blur * w);
      if (d.tracking) g.tracking += d.tracking * w;
      if (d.skew) g.skew += d.skew * w;
      if (d.scatter) {
        const u = unitOf[i];
        g.tx += d.scatter[0] * unitRandom(anim.selector.seed, u, 0) * w;
        g.ty += d.scatter[1] * unitRandom(anim.selector.seed, u, 1) * w;
      }
      if (d.fillColor) {
        const fw = clamp01(w);
        if (fw > 0) (g.fills ??= []).push({ color: d.fillColor, w: fw });
      }
    }
  }
  return out;
}

/**
 * Per-glyph X shift (px) from animator tracking on ONE line. Tracking adds `deltas[k].tracking` em
 * (times `emPx`, the font size in px) of space after character k, so glyph j moves right by the sum over k < j. The line then re-aligns the
 * way the layout does: left text keeps its left edge, centre text shifts back by half the added width,
 * right text by all of it (the added width is the spacing between the first and last glyph). With a
 * uniform tracking of minus each glyph's advance, every glyph of a centred line lands on (nearly) one
 * point (glyph centres differ only by half their own widths).
 * Returns all zeros (fast) when no glyph carries tracking.
 */
export function trackingShifts(deltas: readonly GlyphDelta[], align: 'left' | 'center' | 'right' | string, emPx = 1): number[] {
  const n = deltas.length;
  const out = new Array<number>(n).fill(0);
  if (!deltas.some((d) => d.tracking !== 0)) return out;
  let acc = 0;
  for (let j = 0; j < n; j++) {
    out[j] = acc;
    acc += deltas[j].tracking * emPx;
  }
  const total = n > 0 ? out[n - 1] : 0; // spacing up to the last glyph (trailing space excluded)
  const back = align === 'center' ? total / 2 : align === 'right' ? total : 0;
  if (back !== 0) for (let j = 0; j < n; j++) out[j] -= back;
  return out;
}
