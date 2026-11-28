// B35 - typing caret for type-on text. A text layer with `caret.enabled` gets ONE extra resolved stamp:
// a rectangle placed right after the last revealed glyph (the type-on head), so the caret rides the
// text animators exactly like the reference "I-beam / block caret leading the typing" look. The stamp is
// an ordinary rectangle shape payload, drawn by the existing shape pipeline (zero renderer changes).
//
// Frame purity: the head comes from the frame-resolved animators (no state), the blink from
// (frame - origin) / fps only. No Date, no Math.random.
//
// Placement mirrors expandTextGlyphs (core/interpolation.ts): the same layout (getTextLayout), the same
// advances (measureAdvance) and the same line-start rule, in the layer's local space where (0, 0) is the
// text quad centre. Single visual line only (the glyph-stamp limit); multi-line / text-on-path -> none.

import type { ResolvedFill, ResolvedLayer, ResolvedShape, ResolvedText, ResolvedTransform, TextCaret, TextLayer, Vec4 } from './types';
import { getTextLayout, measureAdvance } from '../engine/textAtlas';
import { accumulateGlyphDeltas, trackingShifts, type ResolvedTextAnimator } from './textAnimator';
import { lineStartX as alignedLineStartX } from './textGlyphLayout';
import { typingFrameOf } from './textTyping';

export const CARET_STYLES = ['bar', 'block', 'underline'] as const;

/** A glyph counts as revealed (the head passed it) from this opacity on. */
const REVEALED = 0.5;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Sanitize an untrusted caret (project file, agent args) into a TextCaret, or undefined when it is not
 * an object. Unknown fields are dropped, bad values fall back to the defaults (lenient, never throws).
 */
export function normalizeTextCaret(raw: unknown): TextCaret | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const style = CARET_STYLES.includes(r.style as TextCaret['style']) ? (r.style as TextCaret['style']) : 'bar';
  const out: TextCaret = { enabled: r.enabled !== false, style };
  if (Array.isArray(r.color) && r.color.length === 4 && r.color.every(finite)) out.color = [r.color[0], r.color[1], r.color[2], r.color[3]] as Vec4;
  if (finite(r.width) && r.width > 0) out.width = r.width;
  if (finite(r.height) && r.height > 0) out.height = r.height;
  if (finite(r.gap)) out.gap = r.gap;
  if (finite(r.offsetY)) out.offsetY = r.offsetY;
  if (finite(r.radius) && r.radius >= 0) out.radius = r.radius;
  if (finite(r.blinkRate) && r.blinkRate >= 0) out.blinkRate = r.blinkRate;
  if (typeof r.solidWhileTyping === 'boolean') out.solidWhileTyping = r.solidWhileTyping;
  if (finite(r.startFrame)) out.startFrame = Math.round(r.startFrame);
  if (finite(r.endFrame)) out.endFrame = Math.round(r.endFrame);
  // B82: a vertical two-colour gradient [top, bottom].
  if (Array.isArray(r.gradient) && r.gradient.length === 2) {
    const [a, b] = r.gradient as unknown[];
    const c4 = (v: unknown): Vec4 | null => (Array.isArray(v) && v.length === 4 && v.every(finite) ? [v[0], v[1], v[2], v[3]] as Vec4 : null);
    const top = c4(a), bottom = c4(b);
    if (top && bottom) out.gradient = [top, bottom];
  }
  return out;
}

/** B82: the caret's vertical gradient as a resolved linear fill (angle 180 deg = top to bottom), or undefined. */
export function caretGradientFill(caret: TextCaret): ResolvedFill | undefined {
  const g = caret.gradient;
  if (!g) return undefined;
  const [top, bottom] = g;
  return {
    kind: 1,
    color: [top[0], top[1], top[2], top[3]],
    layers: [{
      gradientType: 0, angle: Math.PI, centerX: 0.5, centerY: 0.5, blendMode: 0,
      stops: [{ color: [top[0], top[1], top[2], top[3]], position: 0 }, { color: [bottom[0], bottom[1], bottom[2], bottom[3]], position: 1 }],
    }],
  };
}

/** Index just past the last revealed glyph (0 = nothing revealed; content.length = all, or no animators). */
export function caretHeadIndex(content: string, animators: readonly ResolvedTextAnimator[]): number {
  if (animators.length === 0) return content.length;
  const deltas = accumulateGlyphDeltas(content, [...animators]);
  for (let j = deltas.length - 1; j >= 0; j--) if (deltas[j].opacity >= REVEALED) return j + 1;
  return 0;
}

/**
 * Blink state at a frame. `typing` = the head is strictly inside the text (0 < head < length): with
 * solidWhileTyping (default) the caret stays on then, and blinks before the first and after the last
 * glyph. The cycle starts ON at `originFrame` (the clip start).
 */
export function caretBlinkOn(caret: TextCaret, frame: number, fps: number, originFrame: number, typing: boolean): boolean {
  const rate = caret.blinkRate ?? 1;
  if (rate <= 0) return true;
  if (typing && caret.solidWhileTyping !== false) return true;
  const cycles = ((frame - originFrame) / Math.max(1, fps)) * rate;
  const phase = cycles - Math.floor(cycles);
  return phase < 0.5;
}

export interface CaretGeometry {
  /** Caret centre in the layer's local space (0, 0 = the text quad centre), comp px at scale 1. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Glyph index the caret sits before (see caretHeadIndex). */
  head: number;
  /** x of the head (the right edge of the last revealed glyph), local space. */
  headX: number;
  /** Visible this frame (window + blink). */
  visible: boolean;
}

/**
 * Where the caret is at this frame, or null when it cannot be placed (empty / multi-line text).
 * `reflow` (B82: a typing schedule on a B45 reflowHidden layer): hidden glyphs take no space, so the head
 * is measured on the visible glyphs re-aligned like expandTextGlyphs (a centred line grows both ways).
 */
export function caretGeometry(
  caret: TextCaret,
  text: ResolvedText,
  animators: readonly ResolvedTextAnimator[],
  frame: number,
  fps: number,
  originFrame: number,
  reflow = false,
): CaretGeometry | null {
  const content = text.content;
  const layout = getTextLayout(text);
  if (layout.lines.length !== 1 || content.includes('\n') || layout.lines[0] !== content) return null;

  const head = caretHeadIndex(content, animators);
  const fs = text.fontSize;
  const lineW = measureAdvance(text, content, content.length);
  const { canvasWidth, canvasHeight, padding } = layout;
  const lineStartX =
    text.textAlign === 'center' ? (canvasWidth - lineW) / 2
    : text.textAlign === 'right' ? canvasWidth - padding - lineW
    : padding;
  // Animator tracking shifts the glyphs: ride the shift of the last revealed glyph (zeros without tracking).
  let shift = 0;
  if (animators.length > 0 && content.length > 0) {
    const shifts = trackingShifts(accumulateGlyphDeltas(content, [...animators]), text.textAlign, fs);
    shift = shifts[Math.max(0, head - 1)] ?? 0;
  }
  let headX = lineStartX + measureAdvance(text, content, head) + shift - canvasWidth / 2;
  if (reflow && animators.length > 0) {
    // Mirror expandTextGlyphs' B45 reflow: the visible glyphs laid end to end (kerned as one string),
    // the line width without the trailing letter spacing, aligned in the layer raster.
    const deltas = accumulateGlyphDeltas(content, [...animators]);
    const vis: number[] = [];
    for (let j = 0; j < content.length; j++) if (deltas[j].opacity > 0.001) vis.push(j);
    const str = vis.map((j) => content[j]).join('');
    const spacing = text.letterSpacing;
    const full = str.length > 0 ? measureAdvance(text, str, str.length) : 0;
    const visW = str.length > 0 && spacing !== 0 ? full - spacing : full;
    const startX = alignedLineStartX(text.textAlign, canvasWidth, padding, visW);
    let before = 0;
    while (before < vis.length && vis[before] < head) before++;
    const visShifts = trackingShifts(vis.map((j) => deltas[j]), text.textAlign, fs);
    const vShift = before > 0 ? visShifts[before - 1] ?? 0 : 0;
    headX = startX + measureAdvance(text, str, before) + vShift - canvasWidth / 2;
  }

  const style = caret.style;
  const width = caret.width ?? (style === 'bar' ? Math.max(2, fs * 0.06) : fs * 0.55);
  const height = caret.height ?? (style === 'underline' ? Math.max(2, fs * 0.08) : fs);
  const gap = caret.gap ?? (style === 'bar' ? fs * 0.05 : fs * 0.04);
  // The text draws with textBaseline 'top' at y = padding: the em box spans [padding, padding + fs].
  const emTop = padding - canvasHeight / 2;
  const cy = style === 'underline' ? emTop + fs * 0.95 : emTop + fs * 0.5;

  const typing = head > 0 && head < content.length;
  const inWindow = (caret.startFrame === undefined || frame >= caret.startFrame) && (caret.endFrame === undefined || frame < caret.endFrame);
  return {
    x: headX + gap + width / 2,
    y: cy + (caret.offsetY ?? 0),
    width,
    height,
    head,
    headX,
    visible: inWindow && caretBlinkOn(caret, frame, fps, originFrame, typing),
  };
}

/**
 * The caret as a resolved rectangle stamp (id `<layerId>#caret`), or null when off / hidden this frame.
 * `compose` is the resolver's parent-child transform composition (so the caret follows the layer's
 * world transform exactly like the glyph stamps).
 */
export function resolveTextCaretStamp(
  layer: TextLayer,
  text: ResolvedText,
  world: ResolvedTransform,
  animators: readonly ResolvedTextAnimator[],
  frame: number,
  fps: number,
  base: Pick<ResolvedLayer, 'blendMode' | 'glow'>,
  compose: (parent: ResolvedTransform, child: ResolvedTransform) => ResolvedTransform,
): ResolvedLayer | null {
  const caret = layer.caret;
  if (!caret?.enabled || layer.textPath?.enabled) return null;
  // The blink cycle starts ON when the caret appears (its window start, else the clip start). B82: with a
  // typing schedule it restarts ON at the last keystroke, so the caret never vanishes with the last glyph.
  let origin = caret.startFrame ?? layer.inPoint;
  const typing = layer.typing?.enabled && layer.typing.frames.length > 0 ? layer.typing : null;
  if (typing && text.content.length > 0) {
    const lastKey = typingFrameOf(typing, text.content.length - 1);
    if (frame >= lastKey) origin = lastKey;
  }
  const g = caretGeometry(caret, text, animators, frame, fps, origin, typing !== null && layer.reflowHidden === true);
  if (!g || !g.visible) return null;
  const local: ResolvedTransform = {
    positionX: g.x, positionY: g.y, rotation: 0, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0, opacity: 1,
    positionZ: 0, rotationX: 0, rotationY: 0,
  };
  const color: Vec4 = caret.color ?? text.fillColor;
  const shape: ResolvedShape = {
    renderType: 'rectangle',
    width: g.width,
    height: g.height,
    fillColor: [color[0], color[1], color[2], color[3]],
    ...(caret.gradient ? { fill: caretGradientFill(caret) } : {}),
    strokeColor: [0, 0, 0, 0],
    strokeWidth: 0,
    borderRadius: Math.min(caret.radius ?? 0, g.width / 2, g.height / 2),
    radius: 0,
    points: 0,
    outerRadius: 0,
    innerRadius: 0,
    vertices: [],
    closed: true,
    lineCap: 'butt',
    lineJoin: 'miter',
  };
  return {
    id: `${layer.id}#caret`,
    visible: true,
    blendMode: base.blendMode,
    transform: compose(world, local),
    shape,
    ...(base.glow ? { glow: base.glow } : {}),
    ...(layer.is3D ? { is3D: true } : {}),
    layerType: 'shape',
  };
}
