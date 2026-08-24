import type { RangeSelectorConfig } from '../text/rangeSelector';
import { selectorWeights } from '../text/rangeSelector';
import type { TextAnimatorDelta, TextSplitMode } from './types';

// Pure per-character text-animation core. Given the string and a set of frame-resolved animators
// (offset already baked into each selector), it produces a per-character transform/opacity delta by
// blending each animator's property deltas by its range-selector weight (value = base + delta·weight).
// No canvas, no React, no Date/Math.random — fully deterministic and unit-testable
// (scripts/verify-textanimator.mjs). Glyph PLACEMENT (x/y from canvas measurement) is a separate,
// browser-only concern handled at resolve time; this file only computes the per-index deltas.

export interface GlyphDelta {
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  rotation: number;
  opacity: number;
}

/** A frame-resolved animator: selector.offset already evaluated for the current frame. */
export interface ResolvedTextAnimator {
  splitMode: TextSplitMode;
  selector: RangeSelectorConfig;
  delta: TextAnimatorDelta;
}

const identity = (): GlyphDelta => ({ tx: 0, ty: 0, sx: 1, sy: 1, rotation: 0, opacity: 1 });
const isWhitespace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Map each character to its selector UNIT index (and report the unit count), per split mode:
 * - character: one unit per character (spaces included, matching AE's "Characters").
 * - word: one unit per whitespace-delimited run; whitespace attaches to the preceding word.
 * - line: one unit per '\n'-delimited line.
 */
export function splitTextUnits(content: string, mode: TextSplitMode): { unitOf: number[]; unitCount: number } {
  const unitOf = new Array<number>(content.length);
  if (mode === 'character') {
    for (let i = 0; i < content.length; i++) unitOf[i] = i;
    return { unitOf, unitCount: content.length };
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
 * Accumulate every animator into a per-character GlyphDelta array. Positions and rotations add;
 * scale and opacity multiply. Deterministic given the same inputs.
 */
export function accumulateGlyphDeltas(content: string, animators: ResolvedTextAnimator[]): GlyphDelta[] {
  const out: GlyphDelta[] = Array.from({ length: content.length }, identity);
  for (const anim of animators) {
    const { unitOf, unitCount } = splitTextUnits(content, anim.splitMode);
    const weights = selectorWeights(unitCount, anim.selector);
    const d = anim.delta;
    for (let i = 0; i < content.length; i++) {
      const w = weights[unitOf[i]] ?? 0;
      if (w === 0) continue;
      const g = out[i];
      if (d.position) { g.tx += d.position[0] * w; g.ty += d.position[1] * w; }
      if (d.rotation) g.rotation += d.rotation * w;
      if (d.scale) { g.sx *= 1 + d.scale[0] * w; g.sy *= 1 + d.scale[1] * w; }
      if (d.opacity) g.opacity = clamp01(g.opacity * (1 + d.opacity * w));
    }
  }
  return out;
}
