// B82 - per-character typing schedule on a text layer (TextLayer.typing). Character i of the resolved
// content (spaces included) is hidden before frames[i] and shown from it on, so a type-on can follow any
// timing: an even rate (cps / a duration), an EASED rate (r10 S4: slow start, fast middle), or measured
// human keystrokes (r06 S2). With an arrival colour each new character is drawn in that colour on its
// arrival frame and mixes to its own fill over `arrivalFrames` (r10 S11: pink -> white).
//
// The schedule is turned into frame-resolved animators with EXPLICIT per-character weights (an opacity
// hide + a fill-colour mix), so it rides the existing per-glyph stamp path (core/interpolation.ts
// expandTextGlyphs) and the B35 caret head (core/textCaret.ts caretHeadIndex) with no renderer change.
// Frame-pure: no state, no Date, no Math.random. Leaf module (types + easings + the selector default)
// -> node-harnessable (`verify:prompt-box`).

import type { TextTyping, Vec4 } from './types';
import type { ResolvedTextAnimator } from './textAnimator';
import { defaultRangeSelector } from '../text/rangeSelector';
import { applyEasing, cubicBezier } from './easings';

/** Longest schedule kept (characters). */
export const MAX_TYPING_CHARS = 5000;
/** Longest arrival fade kept (frames). */
export const MAX_ARRIVAL_FRAMES = 600;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const color4 = (v: unknown): Vec4 | undefined =>
  Array.isArray(v) && v.length === 4 && v.every(finite) ? [v[0], v[1], v[2], v[3]] as Vec4 : undefined;

/** Integer, non-decreasing frames (a later character never arrives before an earlier one). */
function monotonic(frames: readonly number[]): number[] {
  const out: number[] = [];
  let prev = -Infinity;
  for (const f of frames) {
    const v = Math.max(prev, Math.round(f));
    out.push(v);
    prev = v;
  }
  return out;
}

/**
 * Sanitize an untrusted schedule (project file, agent args) into a TextTyping, or undefined when it is
 * not an object or has no usable frame. Non-finite frames are dropped, frames are rounded and made
 * non-decreasing; unknown fields are dropped (lenient, never throws).
 */
export function normalizeTextTyping(raw: unknown): TextTyping | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.frames)) return undefined;
  const frames = monotonic((r.frames as unknown[]).filter(finite).slice(0, MAX_TYPING_CHARS));
  if (frames.length === 0) return undefined;
  const out: TextTyping = { enabled: r.enabled !== false, frames };
  const ac = color4(r.arrivalColor);
  if (ac) out.arrivalColor = ac;
  if (finite(r.arrivalFrames) && r.arrivalFrames > 0) out.arrivalFrames = Math.min(MAX_ARRIVAL_FRAMES, r.arrivalFrames);
  return out;
}

/** An ease: a core/easings name or a cubic-bezier quad [x1, y1, x2, y2]. Absent = linear. */
export type TypingEase = string | [number, number, number, number];

function easeAt(ease: TypingEase | undefined, u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  if (Array.isArray(ease)) return cubicBezier(t, ease[0], ease[1], ease[2], ease[3]);
  return ease ? applyEasing(ease, t) : t;
}

export interface TypingTimingSpec {
  /** How many characters type (the full content length, spaces included). */
  count: number;
  /** Frame the first character appears on. */
  startFrame: number;
  /** Comp frame rate (for cps). */
  fps: number;
  /** Characters per second (the first at startFrame, then one every fps / cps frames on average). */
  cps?: number;
  /** Frames the typing occupies: the first character on startFrame, the last on startFrame + durationFrames - 1. Wins over cps. */
  durationFrames?: number;
  /** Explicit absolute frame per character (wins over cps / durationFrames; padded with the last, truncated to count). */
  frames?: readonly number[];
  /** The typing RATE ease over the span (r10 S4 measured an easeInOutCubic). Default linear. */
  ease?: TypingEase;
}

/**
 * Arrival frame of every character. Even / eased: character i arrives on the first frame k (from
 * startFrame) where ease(k / span) reaches i / (count - 1), so the first character lands on startFrame,
 * the last on startFrame + span, and an ease bunches the keystrokes where its curve is steep.
 */
export function typingFrames(spec: TypingTimingSpec): number[] {
  const n = Math.max(0, Math.min(MAX_TYPING_CHARS, Math.floor(spec.count)));
  if (n === 0) return [];
  const start = Math.round(spec.startFrame);
  if (spec.frames && spec.frames.length > 0) {
    const src = spec.frames.filter(finite);
    if (src.length > 0) {
      const padded = Array.from({ length: n }, (_, i) => src[Math.min(i, src.length - 1)]);
      return monotonic(padded);
    }
  }
  if (n === 1) return [start];
  const fps = spec.fps > 0 ? spec.fps : 30;
  const span = spec.durationFrames !== undefined && finite(spec.durationFrames)
    ? Math.max(0, spec.durationFrames - 1)
    : ((n - 1) * fps) / Math.max(0.01, finite(spec.cps) && spec.cps > 0 ? spec.cps : 24);
  if (span <= 0) return new Array<number>(n).fill(start);
  const kMax = Math.ceil(span - 1e-9);
  const out: number[] = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    while (k < kMax && easeAt(spec.ease, k / span) < p - 1e-9) k++;
    out.push(start + k);
  }
  return out;
}

/** Arrival frame of character i (past the schedule: the last frame). */
export function typingFrameOf(t: Pick<TextTyping, 'frames'>, i: number): number {
  const f = t.frames;
  return f[Math.min(i, f.length - 1)];
}

/** How many of `count` characters are visible at `frame` (a prefix: the schedule is non-decreasing). */
export function typingVisibleCount(t: Pick<TextTyping, 'frames'>, count: number, frame: number): number {
  let n = 0;
  while (n < count && typingFrameOf(t, n) <= frame) n++;
  return n;
}

/** Arrival-colour weight of character i at `frame`: 1 on its arrival frame, 0 after arrivalFrames (and while hidden). */
export function arrivalWeight(t: TextTyping, i: number, frame: number): number {
  const n = t.arrivalFrames ?? 0;
  if (!t.arrivalColor || !(n > 0)) return 0;
  const a = typingFrameOf(t, i);
  if (frame < a) return 0;
  const w = 1 - (frame - a) / n;
  return w > 0 ? w : 0;
}

/** First / last arrival frame (the typing window). */
export function typingWindow(t: Pick<TextTyping, 'frames'>, count?: number): { startFrame: number; endFrame: number } {
  const n = count === undefined ? t.frames.length : Math.max(1, count);
  return { startFrame: t.frames[0], endFrame: typingFrameOf(t, n - 1) };
}

/**
 * The schedule at `frame` as frame-resolved animators with explicit per-character weights: an opacity
 * hide (weight 1 = not arrived yet) and, with an arrival colour, a fill mix (weight 1 on the arrival
 * frame, fading to 0). Empty when typing is off or nothing applies this frame (all typed, no fade left).
 */
export function typingAnimatorsAt(t: TextTyping | undefined, content: string, frame: number): ResolvedTextAnimator[] {
  if (!t?.enabled || t.frames.length === 0 || content.length === 0) return [];
  const n = content.length;
  const hide = new Array<number>(n);
  let anyHidden = false;
  for (let i = 0; i < n; i++) {
    const h = typingFrameOf(t, i) > frame ? 1 : 0;
    hide[i] = h;
    if (h) anyHidden = true;
  }
  const out: ResolvedTextAnimator[] = [];
  const selector = defaultRangeSelector();
  if (anyHidden) out.push({ splitMode: 'character', selector, delta: { opacity: -1 }, weights: hide });
  if (t.arrivalColor && (t.arrivalFrames ?? 0) > 0) {
    const fill = new Array<number>(n);
    let anyFill = false;
    for (let i = 0; i < n; i++) {
      const w = arrivalWeight(t, i, frame);
      fill[i] = w;
      if (w > 0) anyFill = true;
    }
    if (anyFill) out.push({ splitMode: 'character', selector, delta: { fillColor: t.arrivalColor }, weights: fill });
  }
  return out;
}
