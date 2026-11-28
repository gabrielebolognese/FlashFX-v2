import { createCircleLayer, createGroupLayer, createPolygonLayer, createRectangleLayer, createTextLayer, uid } from '../core/factory';
import { buildKeyframesFromSpecs, type KeyframeEaseSpec, type KeyframeSpec } from '../core/keyframeSpecs';
import type { AnimatableProperty, FontWeight, Layer, PathVertex, ResolvedText, ShapeLayer, TextCaret, TextLayer, Vec2, Vec4 } from '../core/types';
import { getTextInkMetrics, getTextLayout, measureAdvance, measureStringWidth } from '../engine/textAtlas';
import { normalizeTextTyping, typingFrames, typingVisibleCount, type TypingEase } from '../core/textTyping';
import { normalizeTextCaret } from '../core/textCaret';
import { sparseLinearKeys } from './designKit';

// B82 - typing prompt box (r10 S7 / S11 / S12, r06 S2, r04 S1): ONE call builds an editable, undoable
// prompt / search box from ordinary layers (no hidden runtime): a group (entrance keys), the rounded box,
// a placeholder, the typed text (a B82 per-character typing schedule with an optional arrival colour, plus
// the B35 caret, optionally a B82 gradient caret), a send button (press squash), an optional
// "+ / Attach / Themes" chip row and an optional send flash (gradient overlay + a dark wipe back from the
// left). Pure planning (no store): the agent runtime validates, plans and commits it as one undo step.
// Text widths come from the renderer's own layout code (engine/textAtlas), so the text sits where it draws.

export const PROMPT_DARK_FILL: Vec4 = [0x24 / 255, 0x1e / 255, 0x21 / 255, 1]; // r10 S11 #241e21
export const PROMPT_DARK_TEXT: Vec4 = [0xf3 / 255, 0xee / 255, 0xed / 255, 1]; // #f3eeed
export const PROMPT_LIGHT_TEXT: Vec4 = [0x11 / 255, 0x11 / 255, 0x11 / 255, 1]; // r10 S7 #111111
export const PROMPT_ARRIVAL_PINK: Vec4 = [0xe7 / 255, 0x80 / 255, 0xf6 / 255, 1]; // r10 S11 #e780f6
export const PROMPT_CARET_GRADIENT: [Vec4, Vec4] = [[0x61 / 255, 0x75 / 255, 0xce / 255, 1], [0xe8 / 255, 0x5a / 255, 0xa0 / 255, 1]]; // blue #6175ce -> pink #e85aa0
/** r10 S11 click flash: blue -> violet -> orange. */
export const PROMPT_FLASH_COLORS: Vec4[] = [[0x5b / 255, 0x6c / 255, 0xf0 / 255, 1], [0xab / 255, 0x79 / 255, 0xd9 / 255, 1], [0xf0 / 255, 0x8a / 255, 0x5d / 255, 1]];

const EASE_OUT_CUBIC: KeyframeEaseSpec = [0.33, 1, 0.68, 1];
const WIPE_EASE: KeyframeEaseSpec = [0.519, 0.192, 0.413, 0.658]; // r10 S11.E6 measured

export type PromptEntrance = 'none' | 'pop' | 'slideFromRight';

export interface PromptTypingSpec {
  /** Frame the first character appears (default: the box start + the entrance length, or + 6 without one). */
  startFrame?: number;
  cps?: number;
  durationFrames?: number;
  /** Explicit absolute frame per character (r06's human rhythm). */
  frames?: number[];
  /** The typing RATE ease (r10 S4: easeInOutCubic). */
  ease?: TypingEase;
}

export interface PromptCaretSpec {
  color?: Vec4;
  gradient?: [Vec4, Vec4];
  /** Blink cycles per second (default 1); false / 0 = solid. */
  blink?: number | boolean;
  shape?: TextCaret['style'];
  width?: number;
  height?: number;
  /** px between the head (the last glyph's advance) and the caret; default 0 (a text editor's caret). */
  gap?: number;
}

export interface PromptButtonsSpec {
  /** A round send button with an up arrow (default true). */
  send?: boolean;
  /** Chip labels on a row under the text (r10 S7: ["+", "Attach", "Themes"]); a "+" chip is round. */
  row?: string[];
}

export interface PromptBoxSpec {
  /** Box centre, comp px (with autoGrow: the centre of the starting box). */
  x: number;
  y: number;
  width: number;
  height?: number;
  radius?: number;
  theme?: 'light' | 'dark';
  fill?: Vec4;
  textColor?: Vec4;
  placeholderColor?: Vec4;
  strokeColor?: Vec4;
  placeholder?: string;
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: FontWeight;
  /** Frame the box appears (its entrance starts). */
  startFrame: number;
  /** Clip end (exclusive). */
  endFrame: number;
  fps: number;
  typing?: PromptTypingSpec;
  /** false = no caret. */
  caret?: PromptCaretSpec | false;
  arrivalColor?: Vec4;
  arrivalFrames?: number;
  /** The box width follows the typed line (min = width, up to maxWidth). */
  autoGrow?: boolean | { maxWidth?: number };
  buttons?: PromptButtonsSpec;
  /** Send press frame: the send button squashes (100 -> 85 -> 100 %, r10 f462-466). */
  sendFrame?: number;
  /** With sendFrame: the box flashes a gradient (default blue / violet / orange) and the fill wipes back from the left. */
  flash?: boolean | { colors?: Vec4[] };
  entrance?: PromptEntrance;
  entranceFrames?: number;
  /** Password field: true = '*', or the mask character. */
  mask?: boolean | string;
  align?: 'left' | 'center';
  name?: string;
}

export interface PromptBoxPlan {
  layers: Layer[];
  groupId: string;
  boxId: string;
  textId: string;
  placeholderId: string | null;
  sendId: string | null;
  sendArrowId: string | null;
  rowIds: string[];
  flashId: string | null;
  refillId: string | null;
  /** Shown content (the masked string for a password). */
  content: string;
  typing: { startFrame: number; endFrame: number; frames: number[] };
  /** Final geometry (after the entrance; with autoGrow, fully typed), comp px. */
  box: { x: number; y: number; width: number; height: number; left: number; top: number; right: number; bottom: number; radius: number };
  /** Send button centre (final), comp px. */
  sendCenter: Vec2 | null;
  sendFrame: number | null;
  fontSize: number;
  warnings: string[];
}

const rgba = (c: Vec4): Vec4 => [c[0], c[1], c[2], c[3]];
const hex = (c: Vec4): string => `#${[0, 1, 2].map((i) => Math.round(Math.min(1, Math.max(0, c[i])) * 255).toString(16).padStart(2, '0')).join('')}`;
const tag = (l: Layer, role: string): void => { l.rigRole = role; };
const keys = (prop: AnimatableProperty, specs: KeyframeSpec[]): AnimatableProperty => ({ ...prop, keyframes: buildKeyframesFromSpecs(specs) });

/** A per-frame series -> sparse linear keys (designKit's simplifier). Constant -> just the default value. */
function bakedKeys(prop: AnimatableProperty, frames: number[], values: number[][]): AnimatableProperty {
  const ks = sparseLinearKeys(frames, values, 0.01);
  const dim = values[0]?.length ?? 1;
  const def = (dim === 1 ? values[values.length - 1]?.[0] ?? 0 : values[values.length - 1]) as AnimatableProperty['defaultValue'];
  if (ks.length === 0) return { ...prop, defaultValue: (dim === 1 ? values[0][0] : values[0]) as AnimatableProperty['defaultValue'], keyframes: [] };
  return { ...prop, defaultValue: def, keyframes: buildKeyframesFromSpecs(ks.map((k) => ({ frame: k.frame, value: (dim === 1 ? k.value[0] : [k.value[0], k.value[1]]) as KeyframeSpec['value'], ease: 'linear' as const }))) };
}

/** A throwaway ResolvedText laid out by the renderer's code (point text, one style). */
export function promptProbe(content: string, fontFamily: string, fontSize: number, fontWeight: number, align: 'left' | 'center'): ResolvedText {
  return {
    content, mode: 'point', boxWidth: 300, boxHeight: 200, fontFamily, fontWeight, fontStyle: 'normal', fontSize, lineHeight: 1.2,
    letterSpacing: 0, fillColor: [1, 1, 1, 1], strokeColor: [0, 0, 0, 0], strokeWidth: 0, textAlign: align, underline: false, strikethrough: false,
    measuredWidth: 0, measuredHeight: 0,
  };
}

/** Up arrow (send icon) centred on (0, 0), `s` px tall. */
function arrowVertices(s: number): PathVertex[] {
  const h = s / 2, head = s * 0.46, hw = s * 0.42, sw = s * 0.11;
  const pts: Vec2[] = [[0, -h], [hw, -h + head], [sw, -h + head], [sw, h], [-sw, h], [-sw, -h + head], [-hw, -h + head]];
  return pts.map((p) => ({ position: p, handleIn: [0, 0], handleOut: [0, 0], vertexType: 'corner' as const }));
}

function styledText(l: TextLayer, size: number, family: string, weight: FontWeight, align: 'left' | 'center'): void {
  const style = { ...l.content.spans[0].style, fontSize: size, fontFamily: family, fontWeight: weight, lineHeight: 1.2 };
  l.content = { spans: [{ text: l.content.spans[0].text, style }] };
  l.animOverrides = { ...l.animOverrides, fontSize: { ...l.animOverrides.fontSize, defaultValue: size } };
  l.layoutConfig = { ...l.layoutConfig, horizontalAlign: align };
}

/** Plan the prompt box. Throws on unusable input (the runtime turns that into a clear agent error). */
export function planPromptBox(spec: PromptBoxSpec): PromptBoxPlan {
  const warnings: string[] = [];
  const dark = spec.theme === 'dark';
  const W = Math.max(40, spec.width);
  const row = (spec.buttons?.row ?? []).filter((s) => typeof s === 'string' && s.length > 0).slice(0, 8);
  const hasRow = row.length > 0;
  const fs = Math.max(6, spec.fontSize ?? 30);
  const H = Math.max(fs * 1.4, spec.height ?? Math.round(hasRow ? fs * 4.8 : fs * 2.6));
  const R = Math.max(0, Math.min(spec.radius ?? Math.round(H / 2), H / 2, W / 2));
  const family = spec.fontFamily ?? 'Inter';
  const weight = (spec.fontWeight ?? 400) as FontWeight;
  const align = spec.align === 'center' ? 'center' : 'left';
  const fill = rgba(spec.fill ?? (dark ? PROMPT_DARK_FILL : [1, 1, 1, 1]));
  const ink = rgba(spec.textColor ?? (dark ? PROMPT_DARK_TEXT : PROMPT_LIGHT_TEXT));
  const hint = rgba(spec.placeholderColor ?? (dark ? [0.54, 0.51, 0.52, 1] : [0.6, 0.6, 0.6, 1]));
  const stroke = spec.strokeColor ?? (dark ? null : [0.88, 0.88, 0.89, 1] as Vec4);
  const chipStroke: Vec4 = dark ? [1, 1, 1, 0.18] : [0.86, 0.86, 0.87, 1];
  const chipInk: Vec4 = dark ? [0.85, 0.82, 0.83, 1] : [0.2, 0.2, 0.21, 1];
  const start = Math.round(spec.startFrame);
  const end = Math.max(start + 1, Math.round(spec.endFrame));
  const entrance: PromptEntrance = spec.entrance ?? 'none';
  const EF = Math.max(2, Math.round(spec.entranceFrames ?? (entrance === 'pop' ? 10 : 18)));
  const autoGrow = spec.autoGrow === true || (typeof spec.autoGrow === 'object' && spec.autoGrow !== null);
  const maxW = typeof spec.autoGrow === 'object' && spec.autoGrow?.maxWidth ? Math.max(W, spec.autoGrow.maxWidth) : Infinity;

  // Shown content: a password shows one mask character per typed character.
  const chars = [...spec.text];
  const maskChar = spec.mask === true ? '*' : typeof spec.mask === 'string' && spec.mask.length > 0 ? [...spec.mask][0] : null;
  const content = maskChar ? maskChar.repeat(chars.length) : spec.text;

  // ---- layout (box-local, origin = the box centre) ----
  const padX = Math.round(Math.max(fs * 0.8, R * 0.7));
  const sendOn = spec.buttons?.send !== false;
  const sd = sendOn ? Math.round(hasRow ? fs * 1.5 : Math.min(H * 0.64, fs * 2)) : 0;
  const sendInset = hasRow ? Math.round(padX * 0.7) : Math.round((H - sd) / 2);
  const padY = Math.round(fs * 0.85);
  const lineY = hasRow ? -H / 2 + padY + fs * 0.6 : 0;
  const chipH = Math.round(fs * 1.25);
  const rowY = H / 2 - Math.round(padY * 0.8) - chipH / 2;
  const sendY = hasRow ? rowY : 0;
  // Space right of the text: the send button (+ a gap) on a one-line bar; the row puts it below the text.
  const rightSpace = sendOn && !hasRow ? sendInset + sd + Math.round(fs * 0.5) : padX;

  const probe = promptProbe(content, family, fs, weight, align);
  const layout = getTextLayout(probe);
  const fullW = content.length > 0 ? measureAdvance(probe, content, content.length) : 0;
  // Vertical: put the ink centre of the line (or of "Hx" when empty) on lineY.
  const inkOf = (s: string): number => getTextInkMetrics(promptProbe(s.length ? s : 'Hx', family, fs, weight, align)).inkCenterY;
  const textInk = inkOf(content);

  // ---- typing schedule ----
  const tStart = Math.round(spec.typing?.startFrame ?? (entrance === 'none' ? start + 6 : start + EF));
  const frames = content.length > 0
    ? typingFrames({ count: content.length, startFrame: tStart, fps: spec.fps, cps: spec.typing?.cps, durationFrames: spec.typing?.durationFrames, frames: spec.typing?.frames, ease: spec.typing?.ease })
    : [];
  const typing = frames.length > 0
    ? normalizeTextTyping({ enabled: true, frames, ...(spec.arrivalColor ? { arrivalColor: spec.arrivalColor, arrivalFrames: spec.arrivalFrames ?? 4 } : {}) })
    : undefined;
  const tEnd = frames.length > 0 ? frames[frames.length - 1] : tStart;

  // ---- box width over time (autoGrow) ----
  const widthAt = (count: number): number => {
    if (!autoGrow) return W;
    const vis = count > 0 ? measureAdvance(probe, content, count) : 0;
    return Math.min(maxW, Math.max(W, Math.ceil(vis + padX + rightSpace)));
  };
  const finalW = widthAt(content.length);
  const leftEdge = -W / 2; // left align + autoGrow: the left edge stays, the box grows right
  const boxCxAt = (w: number): number => (autoGrow && align === 'left' ? leftEdge + w / 2 : 0);
  if (!autoGrow && fullW > W - padX - rightSpace + 0.5) warnings.push(`the typed line (${Math.round(fullW)} px) is wider than the room in the box (${Math.round(W - padX - rightSpace)} px): widen the box, lower fontSize or set autoGrow`);
  if (autoGrow && Number.isFinite(maxW) && fullW > maxW - padX - rightSpace + 0.5) warnings.push(`the typed line (${Math.round(fullW)} px) is wider than maxWidth allows`);

  const name = spec.name ?? 'Prompt box';
  const group = createGroupLayer(name, spec.x, spec.y, end);
  tag(group, 'prompt.group');

  // Entrance keys.
  const slide = Math.round(W * 0.55);
  const narrow = 0.62; // r10 S11: 540 -> 872 px as it lands
  if (entrance === 'slideFromRight') {
    group.transform.position = keys(group.transform.position, [{ frame: start, value: [spec.x + slide, spec.y], ease: EASE_OUT_CUBIC }, { frame: start + EF, value: [spec.x, spec.y] }]);
    group.transform.opacity = keys(group.transform.opacity, [{ frame: start, value: 0, ease: 'linear' }, { frame: start + Math.min(6, EF), value: 1 }]);
  } else if (entrance === 'pop') {
    group.transform.scale = keys(group.transform.scale, [{ frame: start, value: [0.82, 0.82], ease: 'backOut' }, { frame: start + EF, value: [1, 1] }]);
    group.transform.opacity = keys(group.transform.opacity, [{ frame: start, value: 0, ease: 'quadOut' }, { frame: start + Math.max(2, Math.round(EF / 2)), value: 1 }]);
  }
  const widen = entrance === 'slideFromRight' && !autoGrow;
  const w0 = W * narrow;
  /** Two keys that move a child with the box's left (side -1) or right (+1) edge while it widens. */
  const edgeKeys = (prop: AnimatableProperty, base: Vec2, side: -1 | 1): AnimatableProperty => {
    if (!widen) return { ...prop, defaultValue: base };
    const d = ((W - w0) / 2) * -side;
    return { ...keys(prop, [{ frame: start, value: [base[0] + d, base[1]], ease: EASE_OUT_CUBIC }, { frame: start + EF, value: base }]), defaultValue: base };
  };

  // ---- the box ----
  const box: ShapeLayer = createRectangleLayer(`${name} box`, boxCxAt(W), 0, W, H, fill, end);
  box.parentId = group.id;
  tag(box, 'prompt.box');
  if (box.shape.type === 'rectangle') {
    box.shape.borderRadius = { ...box.shape.borderRadius, defaultValue: R };
    if (stroke) { box.shape.strokeColor = rgba(stroke); box.shape.strokeWidth = { ...box.shape.strokeWidth, defaultValue: 1.5 }; }
    if (widen) box.shape.width = keys(box.shape.width, [{ frame: start, value: w0, ease: EASE_OUT_CUBIC }, { frame: start + EF, value: W }]);
  }
  const layers: Layer[] = [group, box];

  // autoGrow: per-frame width / centre over the typing window, baked to sparse linear keys.
  const growFrames: number[] = [];
  const growW: number[][] = [];
  if (autoGrow && typing) {
    for (let f = (frames[0] ?? tStart) - 1; f <= tEnd; f++) {
      growFrames.push(f);
      growW.push([widthAt(typingVisibleCount(typing, content.length, f))]);
    }
    if (box.shape.type === 'rectangle') box.shape.width = bakedKeys(box.shape.width, growFrames, growW);
    if (align === 'left') box.transform.position = bakedKeys(box.transform.position, growFrames, growW.map(([w]) => [boxCxAt(w), 0]));
  }
  const finalCx = boxCxAt(finalW);

  // ---- flash overlay + refill (under the content) ----
  let flashId: string | null = null, refillId: string | null = null;
  const sendFrame = spec.sendFrame !== undefined && Number.isFinite(spec.sendFrame) ? Math.round(spec.sendFrame) : null;
  if (sendFrame !== null && spec.flash) {
    const cols = (typeof spec.flash === 'object' && spec.flash.colors && spec.flash.colors.length >= 2 ? spec.flash.colors : PROMPT_FLASH_COLORS).slice(0, 6);
    const ov = createRectangleLayer(`${name} flash`, finalCx, 0, finalW, H, rgba(cols[0]), end);
    ov.parentId = group.id;
    tag(ov, 'prompt.flash');
    ov.materialConfig = {
      enabled: true,
      layers: [{
        id: uid(), type: 'linear', angle: 90, blendMode: 'normal', opacity: 100,
        colorStops: cols.map((c, i) => ({ id: uid(), color: hex(c), opacity: Math.round(c[3] * 100), position: Math.round((i / (cols.length - 1)) * 100) })),
      }],
    };
    const wipeStart = sendFrame + 9, wipeEnd = sendFrame + 21; // r10 S11.E6: f471 -> f483 after the f462 click
    if (ov.shape.type === 'rectangle') ov.shape.borderRadius = { ...ov.shape.borderRadius, defaultValue: R };
    ov.transform.opacity = keys(ov.transform.opacity, [{ frame: sendFrame, value: 0, ease: 'linear' }, { frame: sendFrame + 2, value: 1, ease: 'hold' }, { frame: wipeEnd, value: 0 }]);
    const rf = createRectangleLayer(`${name} refill`, finalCx - finalW / 2, 0, 0, H, fill, end);
    rf.parentId = group.id;
    tag(rf, 'prompt.refill');
    if (rf.shape.type === 'rectangle') {
      rf.shape.borderRadius = { ...rf.shape.borderRadius, defaultValue: R };
      rf.shape.width = keys(rf.shape.width, [{ frame: wipeStart, value: 0, ease: WIPE_EASE }, { frame: wipeEnd, value: finalW }]);
      rf.shape.width.defaultValue = finalW;
    }
    rf.transform.position = keys(rf.transform.position, [{ frame: wipeStart, value: [finalCx - finalW / 2, 0], ease: WIPE_EASE }, { frame: wipeEnd, value: [finalCx, 0] }]);
    rf.transform.opacity = keys(rf.transform.opacity, [{ frame: wipeStart - 1, value: 0, ease: 'hold' }, { frame: wipeStart, value: 1 }]);
    layers.push(ov, rf);
    flashId = ov.id; refillId = rf.id;
  }

  // ---- text positions ----
  const textLeft = leftEdge + padX;
  const textCx = align === 'center' ? (padX - rightSpace) / 2 : 0;
  // Left: the line starts at the raster padding, so the quad centre sits half a raster right of it.
  const textPosX = align === 'left' ? textLeft + layout.canvasWidth / 2 - layout.padding : textCx;
  const textPosY = lineY - textInk;

  // Placeholder: shown until the first keystroke.
  let placeholderId: string | null = null;
  if (spec.placeholder) {
    const ph = createTextLayer(`${name} placeholder`, 0, 0, spec.placeholder, end, hint);
    styledText(ph, fs, family, weight, align);
    ph.parentId = group.id;
    tag(ph, 'prompt.placeholder');
    const phLayout = getTextLayout(promptProbe(spec.placeholder, family, fs, weight, align));
    const phX = align === 'left' ? textLeft + phLayout.canvasWidth / 2 - phLayout.padding : textCx;
    const phPos: Vec2 = [phX, lineY - inkOf(spec.placeholder)];
    ph.transform.position = align === 'left' ? edgeKeys(ph.transform.position, phPos, -1) : { ...ph.transform.position, defaultValue: phPos };
    if (frames.length > 0) ph.transform.opacity = keys(ph.transform.opacity, [{ frame: start, value: 1, ease: 'hold' }, { frame: frames[0], value: 0 }]);
    layers.push(ph);
    placeholderId = ph.id;
  }

  // Typed text: the typing schedule + caret.
  const text = createTextLayer(`${name} text`, textPosX, textPosY, content, end, ink);
  styledText(text, fs, family, weight, align);
  text.parentId = group.id;
  tag(text, 'prompt.text');
  if (align === 'left') text.transform.position = edgeKeys(text.transform.position, [textPosX, textPosY], -1);
  if (typing) text.typing = typing;
  if (align === 'center') text.reflowHidden = true; // centred typing grows both ways (B45)
  if (spec.caret !== false) {
    const c = spec.caret ?? {};
    const blinkRate = c.blink === false ? 0 : c.blink === true || c.blink === undefined ? 1 : Math.max(0, c.blink);
    const caret = normalizeTextCaret({
      enabled: true, style: c.shape ?? 'bar', color: c.color ?? (c.gradient ? c.gradient[1] : ink),
      width: c.width ?? Math.max(2, Math.round(fs * 0.08)), height: c.height ?? Math.round(fs * 1.12), radius: 1, gap: c.gap ?? 0,
      blinkRate, solidWhileTyping: true, startFrame: start, endFrame: end,
      ...(c.gradient ? { gradient: c.gradient } : {}),
    });
    if (caret) text.caret = caret;
  }
  layers.push(text);

  // ---- chip row ----
  const rowIds: string[] = [];
  if (hasRow) {
    const cfs = Math.round(fs * 0.55);
    let cx = leftEdge + padX;
    for (const lbl of row) {
      const round = lbl.trim() === '+';
      const tw = measureStringWidth(promptProbe(lbl, family, cfs, 500, 'center'), lbl);
      const cw = round ? chipH : Math.ceil(tw + chipH * 0.9);
      const chip = createRectangleLayer(`${name} chip ${lbl}`, 0, 0, cw, chipH, [0, 0, 0, 0], end);
      chip.parentId = group.id;
      tag(chip, `prompt.chip.${rowIds.length / 2}`);
      if (chip.shape.type === 'rectangle') {
        chip.shape.borderRadius = { ...chip.shape.borderRadius, defaultValue: chipH / 2 };
        chip.shape.strokeColor = rgba(chipStroke);
        chip.shape.strokeWidth = { ...chip.shape.strokeWidth, defaultValue: 1.5 };
      }
      chip.transform.position = edgeKeys(chip.transform.position, [cx + cw / 2, rowY], -1);
      const lt = createTextLayer(`${name} chip ${lbl} label`, 0, 0, lbl, end, chipInk);
      styledText(lt, round ? Math.round(fs * 0.8) : cfs, family, 500, 'center');
      lt.parentId = chip.id;
      tag(lt, `prompt.chip.${rowIds.length / 2}.label`);
      const lInk = getTextInkMetrics(promptProbe(lbl, family, round ? Math.round(fs * 0.8) : cfs, 500, 'center')).inkCenterY;
      lt.transform.position = { ...lt.transform.position, defaultValue: [0, -lInk] };
      layers.push(chip, lt);
      rowIds.push(chip.id, lt.id);
      cx += cw + Math.round(fs * 0.35);
    }
  }

  // ---- send button ----
  let sendId: string | null = null, sendArrowId: string | null = null, sendCenter: Vec2 | null = null;
  if (sendOn) {
    const sendX = (w: number, cxBox: number): number => cxBox + w / 2 - sendInset - sd / 2;
    const btnFill: Vec4 = dark ? rgba(PROMPT_DARK_TEXT) : rgba(PROMPT_LIGHT_TEXT);
    const arrowFill: Vec4 = dark ? rgba(fill) : [1, 1, 1, 1];
    const btn = createCircleLayer(`${name} send`, sendX(W, boxCxAt(W)), sendY, sd / 2, btnFill, end);
    btn.parentId = group.id;
    tag(btn, 'prompt.send');
    btn.transform.position = edgeKeys(btn.transform.position, [sendX(W, boxCxAt(W)), sendY], 1);
    if (autoGrow && typing) btn.transform.position = bakedKeys(btn.transform.position, growFrames, growW.map(([w]) => [sendX(w, boxCxAt(w)), sendY]));
    if (sendFrame !== null) {
      btn.transform.scale = keys(btn.transform.scale, [{ frame: sendFrame, value: [1, 1], ease: 'quadOut' }, { frame: sendFrame + 1, value: [0.85, 0.85], ease: EASE_OUT_CUBIC }, { frame: sendFrame + 4, value: [1, 1] }]);
    }
    const arrow = createPolygonLayer(`${name} send arrow`, 0, 0, arrowVertices(Math.round(sd * 0.46)), true, arrowFill, end);
    arrow.parentId = btn.id;
    tag(arrow, 'prompt.send.arrow');
    if (arrow.shape.type === 'polygon') { arrow.shape.strokeColor = rgba(arrowFill); arrow.shape.strokeWidth = { ...arrow.shape.strokeWidth, defaultValue: Math.max(1, sd * 0.03) }; }
    layers.push(btn, arrow);
    sendId = btn.id; sendArrowId = arrow.id;
    sendCenter = [spec.x + sendX(finalW, finalCx), spec.y + sendY];
  }

  for (const l of layers) { l.inPoint = start; l.outPoint = end; }
  return {
    layers, groupId: group.id, boxId: box.id, textId: text.id, placeholderId, sendId, sendArrowId, rowIds, flashId, refillId, content,
    typing: { startFrame: frames[0] ?? tStart, endFrame: tEnd, frames },
    box: { x: spec.x + finalCx, y: spec.y, width: finalW, height: H, left: spec.x + finalCx - finalW / 2, top: spec.y - H / 2, right: spec.x + finalCx + finalW / 2, bottom: spec.y + H / 2, radius: R },
    sendCenter, sendFrame, fontSize: fs, warnings,
  };
}
