import type { TextSpan, TextSpanStyle, TextStyleRun, TextGradientFill, Vec4 } from './types';

// Mixed styles inside ONE text layer (the "accent word": one word of a kinetic title set in an italic
// serif or a highlight colour). The data model always had multiple spans, but resolve collapsed the
// layer to spans[0]'s style. This pure module (a) edits spans by character range and (b) derives the
// per-character style RUNS the glyph-stamp path draws. Only the face (family / weight / style) and the
// fill (colour / gradient) vary per run; size, tracking and line height stay layer-wide so every run
// shares one baseline and line box. No React / canvas / DOM: verified by scripts/verify-text-runs.mjs.

/** The span-style fields that may differ per run (everything else is layer-wide). */
export type RunStylePatch = Partial<Pick<TextSpanStyle, 'fontFamily' | 'fontWeight' | 'fontStyle' | 'color' | 'fill'>>;

const sameVec = (a: Vec4, b: Vec4): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const sameFill = (a: TextGradientFill | undefined, b: TextGradientFill | undefined): boolean =>
  a === b || (!!a && !!b && JSON.stringify(a) === JSON.stringify(b));

/** True when two span styles draw identically for the per-run fields. */
function sameRunStyle(a: TextSpanStyle, b: TextSpanStyle): boolean {
  return a.fontFamily === b.fontFamily && a.fontWeight === b.fontWeight && a.fontStyle === b.fontStyle
    && sameVec(a.color, b.color) && sameFill(a.fill, b.fill);
}

/** True when two span styles are equal in EVERY field (safe to merge the spans). */
function sameFullStyle(a: TextSpanStyle, b: TextSpanStyle): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The span's text as displayed (its textTransform applied), matching resolve's full-text join. */
export function displayedSpanText(span: TextSpan): string {
  const t = span.style.textTransform;
  if (t === 'uppercase') return span.text.toUpperCase();
  if (t === 'lowercase') return span.text.toLowerCase();
  if (t === 'capitalize') return span.text.replace(/\b\w/g, (c) => c.toUpperCase());
  return span.text;
}

/**
 * Per-character style runs for a span list, over the DISPLAYED text. Null when every span draws like
 * the first one (the plain single-style path stays untouched). Adjacent spans with the same run style
 * merge into one run; empty spans vanish.
 */
export function textRunsFromSpans(spans: readonly TextSpan[]): TextStyleRun[] | null {
  if (spans.length < 2) return null;
  const base = spans[0].style;
  if (spans.every((s) => sameRunStyle(s.style, base))) return null;
  const runs: TextStyleRun[] = [];
  let pos = 0;
  for (const span of spans) {
    const len = displayedSpanText(span).length;
    if (len === 0) continue;
    const st = span.style;
    const last = runs[runs.length - 1];
    if (last && last.end === pos && last.fontFamily === st.fontFamily && last.fontWeight === st.fontWeight
      && last.fontStyle === st.fontStyle && sameVec(last.fillColor, st.color) && sameFill(last.fill, st.fill)) {
      last.end = pos + len;
    } else {
      runs.push({
        start: pos,
        end: pos + len,
        fontFamily: st.fontFamily,
        fontWeight: st.fontWeight,
        fontStyle: st.fontStyle,
        fillColor: st.color,
        ...(st.fill ? { fill: st.fill } : {}),
      });
    }
    pos += len;
  }
  return runs.length > 1 ? runs : null;
}

/** The run covering character index i (falls back to the last run). */
export function runAt(runs: readonly TextStyleRun[], i: number): TextStyleRun {
  for (const r of runs) if (i >= r.start && i < r.end) return r;
  return runs[runs.length - 1];
}

/**
 * Apply a style patch to the characters [start, end) of a span list (raw-text indices), splitting
 * spans at the range edges and merging neighbours that end up identical. Returns a NEW array (the
 * input is never mutated). An empty or out-of-range selection returns the spans unchanged (copied).
 * Patching `color` drops a gradient `fill` on the patched part unless the patch sets one, so the new
 * colour actually shows.
 */
export function styleTextRange(spans: readonly TextSpan[], start: number, end: number, patch: RunStylePatch): TextSpan[] {
  const total = spans.reduce((n, s) => n + s.text.length, 0);
  const a = Math.max(0, Math.min(total, Math.floor(start)));
  const b = Math.max(a, Math.min(total, Math.floor(end)));
  const cloneStyle = (st: TextSpanStyle): TextSpanStyle => ({ ...st, color: [...st.color] as Vec4, strokeColor: [...st.strokeColor] as Vec4 });
  if (a === b) return spans.map((s) => ({ text: s.text, style: cloneStyle(s.style) }));

  const patched = (st: TextSpanStyle): TextSpanStyle => {
    const next: TextSpanStyle = { ...cloneStyle(st), ...patch };
    if (patch.color) next.color = [...patch.color] as Vec4;
    if (patch.color && !('fill' in patch)) delete next.fill;
    return next;
  };

  const pieces: TextSpan[] = [];
  let pos = 0;
  for (const span of spans) {
    const s0 = pos;
    const s1 = pos + span.text.length;
    pos = s1;
    const cuts = [s0, Math.min(Math.max(a, s0), s1), Math.min(Math.max(b, s0), s1), s1];
    for (let k = 0; k < 3; k++) {
      const c0 = cuts[k];
      const c1 = cuts[k + 1];
      if (c1 <= c0) continue;
      const text = span.text.slice(c0 - s0, c1 - s0);
      pieces.push({ text, style: k === 1 ? patched(span.style) : cloneStyle(span.style) });
    }
  }
  // Merge identical neighbours (keeps the span list minimal after repeated edits).
  const merged: TextSpan[] = [];
  for (const p of pieces) {
    const last = merged[merged.length - 1];
    if (last && sameFullStyle(last.style, p.style)) last.text += p.text;
    else merged.push(p);
  }
  return merged.length ? merged : spans.map((s) => ({ text: s.text, style: cloneStyle(s.style) }));
}

/** Reset every span to the first span's style (one span holding the whole text). */
export function clearTextStyles(spans: readonly TextSpan[]): TextSpan[] {
  if (spans.length === 0) return [];
  const text = spans.map((s) => s.text).join('');
  const st = spans[0].style;
  return [{ text, style: { ...st, color: [...st.color] as Vec4, strokeColor: [...st.strokeColor] as Vec4 } }];
}

/** Whitespace-delimited words of a string with their [start, end) character ranges. */
export function wordRanges(text: string): { word: string; start: number; end: number }[] {
  const out: { word: string; start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}

/**
 * Set one style field on the text's BASE spans: spans[0] plus every span whose value for that field
 * equals spans[0]'s current value. Used when the Inspector edits `content.spans[0].style.<field>` so
 * a base-style change (family, colour, weight...) restyles the whole text while a deliberately
 * different accent run keeps its own value. A single-span text behaves exactly like before.
 */
export function setBaseSpanStyle(spans: readonly TextSpan[], field: keyof TextSpanStyle, value: unknown): TextSpan[] {
  if (spans.length === 0) return [];
  const old = JSON.stringify(spans[0].style[field]);
  return spans.map((s, i) => (i === 0 || JSON.stringify(s.style[field]) === old
    ? { text: s.text, style: { ...s.style, [field]: value } as TextSpanStyle }
    : s));
}

/**
 * Replace the whole text of a span list (the Inspector's Text Content box) while KEEPING the per-span
 * styles: the unchanged prefix and suffix keep their spans, and the edited middle takes the style of the
 * first character it replaces (an insertion takes the character before it, or after it at the start).
 * So retyping "The AI" as "Your AI" keeps "AI" as the accent word instead of flattening every span to
 * spans[0]'s style. A single-span text simply gets the new text.
 */
export function replaceSpansText(spans: readonly TextSpan[], next: string): TextSpan[] {
  if (spans.length === 0) return [];
  if (spans.length === 1) return [{ ...spans[0], text: next }];
  const owner: number[] = [];
  spans.forEach((s, i) => { for (let k = 0; k < s.text.length; k++) owner.push(i); });
  const prev = spans.map((s) => s.text).join('');
  let pre = 0;
  while (pre < prev.length && pre < next.length && prev[pre] === next[pre]) pre++;
  let suf = 0;
  while (suf < prev.length - pre && suf < next.length - pre && prev[prev.length - 1 - suf] === next[next.length - 1 - suf]) suf++;
  const midOwner = pre < prev.length - suf ? owner[pre] : (pre > 0 ? owner[pre - 1] : (owner[pre] ?? 0));
  const nextOwner: number[] = [];
  for (let k = 0; k < next.length; k++) {
    if (k < pre) nextOwner.push(owner[k]);
    else if (k >= next.length - suf) nextOwner.push(owner[prev.length - (next.length - k)]);
    else nextOwner.push(midOwner);
  }
  const out: TextSpan[] = [];
  let k = 0;
  while (k < next.length) {
    let e = k + 1;
    while (e < next.length && nextOwner[e] === nextOwner[k]) e++;
    out.push({ ...spans[nextOwner[k]], text: next.slice(k, e) });
    k = e;
  }
  // Empty text: keep the base span (with its style) so the layer still has one span.
  return out.length ? out : [{ ...spans[0], text: '' }];
}
