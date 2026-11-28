import type { ResolvedText, TextGradientFill } from '../core/types';

interface CachedTextEntry {
  bitmap: ImageBitmap;
  /** Raster size in px, INCLUDING the B43 overhang pad (padX / padY on each side). */
  width: number;
  height: number;
  key: string;
  /** B43: extra px on EACH side for glyph ink that overhangs the measured box (italics, f hooks,
   *  strokes). 0 when nothing overhangs. The raster stays centred on the measured box, so the layout
   *  (measureText, glyph slots, the layer position) does not move; only the drawn quad grows. */
  padX: number;
  padY: number;
}

export interface TextLayout {
  lines: string[];
  lineHeightPx: number;
  canvasWidth: number;
  canvasHeight: number;
  padding: number;
  /** Extra width on EACH side for a skewed raster (B36 glyph skew); 0 / absent when unskewed. */
  skewPad?: number;
}

const cache = new Map<string, CachedTextEntry>();
const MAX_CACHE_SIZE = 256;

const POINT_PADDING = 2;
/** The inset of a point-text raster (its first line's top sits this far below the canvas top). */
export const TEXT_POINT_PADDING = POINT_PADDING;
const DESCENDER_RATIO = 0.25;

// Bumped once the bundled fonts finish loading (see engine/fonts.ts). Folded into the cache
// key so text rasterized against the sans-serif fallback (pre-load) is re-rasterized against
// the real face afterwards - both this bitmap cache and the renderer's key-based GPU texture
// cache miss and rebuild.
let fontEpoch = 0;
export function bumpFontEpoch(): void {
  fontEpoch++;
  clearTextCache();
}

function fillKey(text: ResolvedText): string {
  const f = text.fill;
  if (!f) return '';
  const ff = text.fillFrame ? `|ff${text.fillFrame.x.toFixed(2)},${text.fillFrame.y.toFixed(2)},${text.fillFrame.width},${text.fillFrame.height}` : '';
  return `${f.kind}:${f.angle}:${f.stops.map((s) => `${s.color.join(',')}@${s.position}x${s.opacity}`).join(';')}${ff}`;
}

export function textCacheKey(text: ResolvedText): string {
  const skew = text.skewX ? `|sk${text.skewX}` : '';
  return `${fontEpoch}|${text.content}|${text.fontFamily}|${text.fontWeight}|${text.fontStyle}|${text.fontSize}|${text.lineHeight}|${text.letterSpacing}|${text.textAlign}|${text.fillColor.join(',')}|${fillKey(text)}|${text.strokeColor.join(',')}|${text.strokeWidth}|${text.underline}|${text.strikethrough}|${text.mode}|${text.boxWidth}|${text.boxHeight}${skew}`;
}

/** tan of a stamp's skew, clamped to +-80 degrees (a near-90 shear has no finite raster). */
function skewTan(text: ResolvedText): number {
  const deg = text.skewX ? Math.max(-80, Math.min(80, text.skewX)) : 0;
  return deg === 0 ? 0 : Math.tan((deg * Math.PI) / 180);
}

/** Widen a layout for a skewed raster: the shear about the vertical centre moves the top and bottom
 *  rows by up to tan * height / 2, so both sides grow by that much (the centre stays put). */
function withSkew(layout: TextLayout, text: ResolvedText): TextLayout {
  const tan = skewTan(text);
  if (tan === 0) return layout;
  const skewPad = Math.ceil((Math.abs(tan) * layout.canvasHeight) / 2);
  return { ...layout, canvasWidth: layout.canvasWidth + 2 * skewPad, skewPad };
}

// B52: lazy font faces. engine/fonts.ts installs a requester that loads the bundled face a text draws
// with on first use (then bumps the epoch above so the text re-rasterizes). Every measure / raster
// path builds its CSS font string here, so this is the one place that sees every face in use.
// Unset (Node harnesses, workers) = no-op.
type FontFaceRequester = (family: string, weight: number, style: 'normal' | 'italic') => void;
let fontFaceRequester: FontFaceRequester | null = null;
export function setFontFaceRequester(fn: FontFaceRequester | null): void {
  fontFaceRequester = fn;
}

export function buildFontString(text: ResolvedText): string {
  const style = text.fontStyle === 'italic' ? 'italic' : 'normal';
  fontFaceRequester?.(text.fontFamily, text.fontWeight, style);
  return `${style} ${text.fontWeight} ${text.fontSize}px "${text.fontFamily}", sans-serif`;
}

/** Build a Canvas gradient spanning the text box, from a TextGradientFill descriptor. */
function buildTextGradient(
  ctx: OffscreenCanvasRenderingContext2D,
  fill: TextGradientFill,
  w: number,
  h: number,
  ox = 0,
  oy = 0,
): CanvasGradient {
  const cx = ox + w / 2;
  const cy = oy + h / 2;
  let grad: CanvasGradient;
  if (fill.kind === 'radial') {
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) / 2);
  } else if (fill.kind === 'conic') {
    // createConicGradient is available in the Chromium/WebGPU target this app requires.
    grad = ctx.createConicGradient((fill.angle * Math.PI) / 180, cx, cy);
  } else {
    const a = (fill.angle * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const ext = (Math.abs(dx) * w + Math.abs(dy) * h) / 2;
    grad = ctx.createLinearGradient(cx - dx * ext, cy - dy * ext, cx + dx * ext, cy + dy * ext);
  }
  const stops = fill.stops.length > 0 ? fill.stops : [{ color: [1, 1, 1] as [number, number, number], position: 0, opacity: 1 }];
  for (const s of stops) {
    const pos = Math.max(0, Math.min(1, s.position));
    const [r, g, b] = s.color;
    grad.addColorStop(pos, `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${s.opacity})`);
  }
  return grad;
}

function measureLineWithSpacing(ctx: OffscreenCanvasRenderingContext2D, line: string, spacing: number): number {
  let width = 0;
  for (let i = 0; i < line.length; i++) {
    const m = ctx.measureText(line[i]);
    width += m.width + (i < line.length - 1 ? spacing : 0);
  }
  return width;
}

function lineWidth(ctx: OffscreenCanvasRenderingContext2D, line: string, spacing: number): number {
  return spacing !== 0 ? measureLineWithSpacing(ctx, line, spacing) : ctx.measureText(line).width;
}

function layoutLines(ctx: OffscreenCanvasRenderingContext2D, text: ResolvedText): string[] {
  if (text.mode === 'point') {
    return text.content.split('\n');
  }

  const lines: string[] = [];
  for (const paragraph of text.content.split('\n')) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/(\s+)/);
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine + word;
      if (lineWidth(ctx, testLine, text.letterSpacing) > text.boxWidth && currentLine.length > 0) {
        lines.push(currentLine.trimEnd());
        currentLine = word.trimStart();
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine.trimEnd());
  }
  if (lines.length === 0) lines.push('');
  return lines;
}

function computeLayout(ctx: OffscreenCanvasRenderingContext2D, text: ResolvedText): TextLayout {
  return withSkew(computeUnskewedLayout(ctx, text), text);
}

function computeUnskewedLayout(ctx: OffscreenCanvasRenderingContext2D, text: ResolvedText): TextLayout {
  ctx.font = buildFontString(text);
  const lines = layoutLines(ctx, text);
  const lineHeightPx = text.fontSize * text.lineHeight;

  if (text.mode === 'box') {
    return {
      lines,
      lineHeightPx,
      canvasWidth: Math.max(1, Math.ceil(text.boxWidth)),
      canvasHeight: Math.max(1, Math.ceil(text.boxHeight)),
      padding: 0,
    };
  }

  let maxWidth = 0;
  for (const line of lines) {
    maxWidth = Math.max(maxWidth, lineWidth(ctx, line, text.letterSpacing));
  }
  const contentHeight = lines.length * lineHeightPx + text.fontSize * DESCENDER_RATIO;

  return {
    lines,
    lineHeightPx,
    canvasWidth: Math.max(1, Math.ceil(maxWidth) + POINT_PADDING * 2),
    canvasHeight: Math.max(1, Math.ceil(contentHeight) + POINT_PADDING * 2),
    padding: POINT_PADDING,
  };
}

// Measurement only needs a 2D context - reuse a single scratch canvas/context
// across all calls instead of allocating a fresh OffscreenCanvas per text layer
// per frame (a measurable per-frame cost). Every call sets ctx.font before
// measuring, so there's no stale-state hazard from sharing it.
let _measureCtx: OffscreenCanvasRenderingContext2D | null = null;
function measureCtx(): OffscreenCanvasRenderingContext2D {
  if (!_measureCtx) _measureCtx = new OffscreenCanvas(1, 1).getContext('2d')!;
  return _measureCtx;
}

// Memoized text MEASUREMENT (P2c): computeLayout does canvas word-wrap + per-line measurement, and
// resolveFrame calls measureText every frame for every text layer even when the text never changes -
// pure wasted work on static captions/titles over a playing video. The result is a pure function of the
// same inputs textCacheKey already captures for the render cache (including fontEpoch, so a font load
// flips the key), so memoizing by that key is complete by construction: a static text layer skips the
// re-measure each frame; any change to content/size/font/box/align flips the key and re-measures. The
// returned object is read-only to every caller (interpolation, sceneGraph, snap, textExplode), so
// sharing the cached instance is safe. Bounded LRU, same cap as the render cache.
const measureCache = new Map<string, { width: number; height: number }>();
const MAX_MEASURE_CACHE = 256;

export function measureText(text: ResolvedText): { width: number; height: number } {
  const key = textCacheKey(text);
  const hit = measureCache.get(key);
  if (hit) return hit;
  const layout = computeLayout(measureCtx(), text);
  const result = { width: layout.canvasWidth, height: layout.canvasHeight };
  if (measureCache.size >= MAX_MEASURE_CACHE) {
    const firstKey = measureCache.keys().next().value as string | undefined;
    if (firstKey !== undefined) measureCache.delete(firstKey);
  }
  measureCache.set(key, result);
  return result;
}

// Full layout used by the text-explode engine to read exact line geometry
// (the same wrapping + canvas sizing the renderer relies on).
export function getTextLayout(text: ResolvedText): TextLayout {
  return computeLayout(measureCtx(), text);
}

// Width of a single line/string measured exactly as the renderer draws it
// (kerned when letterSpacing is 0, otherwise per-glyph + spacing between).
export function measureStringWidth(text: ResolvedText, str: string): number {
  const ctx = measureCtx();
  ctx.font = buildFontString(text);
  return lineWidth(ctx, str, text.letterSpacing);
}

/** Vertical glyph metrics of a text raster, in layer px relative to the raster CENTRE (= the layer position at scale 1). */
export interface TextInkMetrics {
  /** Alphabetic baseline of every line (y offset from the centre, + = down). */
  baselines: number[];
  /** Top / bottom of the real glyph ink across all lines (+ = down). */
  inkTop: number;
  inkBottom: number;
  /** (inkTop + inkBottom) / 2: how far the visible ink centre sits below the layer position. */
  inkCenterY: number;
  /** The line-box centre offset (always ~0 for point text: the raster is centred on the position). */
  boxCenterY: number;
  /** B72: left / right of the real glyph ink across all lines (+ = right of the centre; skew not applied). */
  inkLeft: number;
  inkRight: number;
}

// B67 - agents place text by what the eye sees (the ink centre or the baseline), not the line-box
// centre: mixed-case words sit ~0.15 x size high when y is the box centre. Same font string, wrap and
// line tops as the rasterizer below (textBaseline 'top' at padding + i * lineHeightPx).
export function getTextInkMetrics(text: ResolvedText): TextInkMetrics {
  const ctx = measureCtx();
  const layout = computeLayout(ctx, text);
  ctx.font = buildFontString(text);
  ctx.textBaseline = 'top';
  const half = layout.canvasHeight / 2;
  const alignWidth = layout.canvasWidth - 2 * (layout.skewPad ?? 0);
  const halfW = layout.canvasWidth / 2;
  const baselines: number[] = [];
  let inkTop = Infinity;
  let inkBottom = -Infinity;
  let inkLeft = Infinity;
  let inkRight = -Infinity;
  layout.lines.forEach((line, i) => {
    const top = layout.padding + i * layout.lineHeightPx;
    const m = ctx.measureText(line.length ? line : 'x');
    // alphabeticBaseline is measured from the textBaseline ('top') with + = up.
    baselines.push(top - m.alphabeticBaseline - half);
    if (line.trim().length === 0) return;
    inkTop = Math.min(inkTop, top - m.actualBoundingBoxAscent - half);
    inkBottom = Math.max(inkBottom, top + m.actualBoundingBoxDescent - half);
    // B72: horizontal ink, drawn at the same x as renderTextToCanvas (per glyph when letter-spaced).
    const x0 = lineStartX(text, alignWidth, layout.padding, lineWidth(ctx, line, text.letterSpacing)) + (layout.skewPad ?? 0) - halfW;
    if (text.letterSpacing === 0) {
      inkLeft = Math.min(inkLeft, x0 - m.actualBoundingBoxLeft);
      inkRight = Math.max(inkRight, x0 + m.actualBoundingBoxRight);
    } else {
      let gx = x0;
      for (const ch of line) {
        const g = ctx.measureText(ch);
        if (ch.trim().length) {
          inkLeft = Math.min(inkLeft, gx - g.actualBoundingBoxLeft);
          inkRight = Math.max(inkRight, gx + g.actualBoundingBoxRight);
        }
        gx += g.width + text.letterSpacing;
      }
    }
  });
  if (!Number.isFinite(inkTop)) { inkTop = 0; inkBottom = 0; }
  if (!Number.isFinite(inkLeft)) { inkLeft = 0; inkRight = 0; }
  return { baselines, inkTop, inkBottom, inkCenterY: (inkTop + inkBottom) / 2, boxCenterY: 0, inkLeft, inkRight };
}

// X advance to reach character index `count` within `line`, mirroring how
// drawTextWithSpacing advances curX (each glyph adds its width + spacing).
export function measureAdvance(text: ResolvedText, line: string, count: number): number {
  // The shared scratch context (sets the font first, like every measurement): per-glyph stamps call
  // this once per character per frame, so a fresh canvas each call was a real per-frame cost.
  const ctx = measureCtx();
  ctx.font = buildFontString(text);
  if (text.letterSpacing === 0) return ctx.measureText(line.slice(0, count)).width;
  let x = 0;
  for (let i = 0; i < count; i++) x += ctx.measureText(line[i]).width + text.letterSpacing;
  return x;
}

/** Left x of a drawn line inside the (unskewed) raster box, exactly as renderTextToCanvas aligns it. */
function lineStartX(text: ResolvedText, alignWidth: number, padding: number, lineW: number): number {
  if (text.textAlign === 'center') return (alignWidth - lineW) / 2;
  if (text.textAlign === 'right') return alignWidth - padding - lineW;
  return padding;
}

/**
 * B43: the symmetric pad (px per side) that keeps every glyph's ink inside the raster. Canvas 2D's
 * actualBoundingBox* metrics are the real ink extents (true italics, the synthesized oblique of a face
 * with no italic file, f / j hooks), so the pad is the largest overhang past the measured box, plus half
 * the stroke (round joins) and 1 px of antialiasing slack. 0 when nothing overhangs, so upright text
 * rasterizes exactly as before. Box text keeps its old clipping for lines that do not fit the box (a
 * word wider than the box, lines below its bottom): only lines inside it can grow the raster.
 * `ctx` has the text's font set and textBaseline 'top'.
 */
function inkOverhangPad(ctx: OffscreenCanvasRenderingContext2D, text: ResolvedText, layout: TextLayout, alignWidth: number, tan: number): { padX: number; padY: number } {
  const { lines, lineHeightPx, canvasHeight, padding } = layout;
  const halfStroke = text.strokeWidth > 0 ? text.strokeWidth / 2 : 0;
  let left = 0, right = 0, top = 0, bottom = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const y = padding + i * lineHeightPx;
    const lineW = lineWidth(ctx, line, text.letterSpacing);
    if (text.mode === 'box' && (lineW > alignWidth + 0.5 || y + lineHeightPx > canvasHeight + 0.5)) continue;
    const x = lineStartX(text, alignWidth, padding, lineW);
    let inkL = Infinity, inkR = -Infinity, inkT = Infinity, inkB = -Infinity;
    const take = (m: TextMetrics, gx: number) => {
      inkL = Math.min(inkL, gx - m.actualBoundingBoxLeft);
      inkR = Math.max(inkR, gx + m.actualBoundingBoxRight);
      inkT = Math.min(inkT, y - m.actualBoundingBoxAscent);
      inkB = Math.max(inkB, y + m.actualBoundingBoxDescent);
    };
    if (text.letterSpacing !== 0) {
      let curX = x;
      for (let j = 0; j < line.length; j++) {
        const m = ctx.measureText(line[j]);
        take(m, curX);
        curX += m.width + text.letterSpacing;
      }
    } else {
      take(ctx.measureText(line), x);
    }
    if (!Number.isFinite(inkL)) continue;
    left = Math.max(left, halfStroke - inkL);
    right = Math.max(right, inkR + halfStroke - alignWidth);
    top = Math.max(top, halfStroke - inkT);
    bottom = Math.max(bottom, inkB + halfStroke - canvasHeight);
  }
  const ox = Math.max(left, right);
  const oy = Math.max(top, bottom);
  if (!(ox > 0.01) && !(oy > 0.01)) return { padX: 0, padY: 0 }; // nothing overhangs: the old raster, byte-identical
  // Once the raster is padded at all, both axes keep >= 1 px of antialiasing slack: ink that ends exactly on
  // the box edge (an italic serif, a round bowl) still bleeds a faint pixel past it.
  const padY = Math.ceil(Math.max(0, oy)) + 1;
  // A skewed stamp (B36) shears rows about the vertical centre: the taller raster shears further.
  const padX = Math.ceil(Math.max(0, ox) + Math.abs(tan) * padY) + 1;
  return { padX, padY };
}

/** B43: does any pixel of the raster's outermost rows / columns carry ink (alpha > 0)? */
function rasterBorderHasInk(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number): boolean {
  if (w < 1 || h < 1) return false;
  const strips: [number, number, number, number][] = [[0, 0, w, 1], [0, h - 1, w, 1], [0, 0, 1, h], [w - 1, 0, 1, h]];
  for (const [x, y, sw, sh] of strips) {
    const d = ctx.getImageData(x, y, sw, sh).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
  }
  return false;
}

export function renderTextToCanvas(text: ResolvedText): CachedTextEntry | null {
  const key = textCacheKey(text);
  const cached = cache.get(key);
  if (cached) return cached;

  const measureCanvas = new OffscreenCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d')!;
  const layout = computeLayout(measureCtx, text);

  const { lines, lineHeightPx, canvasWidth, canvasHeight, padding } = layout;
  // A skewed glyph stamp (B36): align inside the unskewed width, then shear about the vertical centre.
  const skewPad = layout.skewPad ?? 0;
  const alignWidth = canvasWidth - 2 * skewPad;

  const tan = skewTan(text);
  // B43: grow the raster by the ink that overhangs the measured box (measured on the scratch context,
  // same font), symmetrically so its centre - the layer position - stays put.
  measureCtx.font = buildFontString(text);
  measureCtx.textBaseline = 'top';
  const pad0 = inkOverhangPad(measureCtx, text, layout, alignWidth, tan);
  let padX = pad0.padX;
  let padY = pad0.padY;
  let rasterWidth = canvasWidth;
  let rasterHeight = canvasHeight;
  let canvas = new OffscreenCanvas(1, 1);
  // B43: canvas metrics can under-report a face's real ink by a pixel or two (Instrument Serif italic), so a
  // padded raster is checked after drawing: ink on its border means it was cut, and it is redrawn with a larger
  // pad (at most twice). Unpadded (upright) text skips the check: its raster is exactly the old one.
  for (let attempt = 0; ; attempt++) {
    rasterWidth = canvasWidth + 2 * padX;
    rasterHeight = canvasHeight + 2 * padY;
    canvas = new OffscreenCanvas(rasterWidth, rasterHeight);
    const ctx = canvas.getContext('2d')!;
    ctx.font = buildFontString(text);
    ctx.textBaseline = 'top';
    if (tan !== 0) ctx.setTransform(1, 0, -tan, 1, padX + skewPad + (tan * canvasHeight) / 2, padY);
    else if (padX !== 0 || padY !== 0) ctx.setTransform(1, 0, 0, 1, padX, padY);

    const [fr, fg, fb, fa] = text.fillColor;
    const solidFill = `rgba(${Math.round(fr * 255)},${Math.round(fg * 255)},${Math.round(fb * 255)},${fa})`;
    // Gradient fills paint across the whole box (layer space) so they don't swim per glyph.
    const fillPaint: string | CanvasGradient = text.fill
      ? (text.fillFrame
        ? buildTextGradient(ctx, text.fill, text.fillFrame.width, text.fillFrame.height, text.fillFrame.x, text.fillFrame.y)
        : buildTextGradient(ctx, text.fill, canvasWidth, canvasHeight))
      : solidFill;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const y = padding + i * lineHeightPx;

      const lineW = lineWidth(ctx, line, text.letterSpacing);
      const x = lineStartX(text, alignWidth, padding, lineW);

      if (text.strokeWidth > 0) {
        const [sr, sg, sb, sa] = text.strokeColor;
        ctx.strokeStyle = `rgba(${Math.round(sr * 255)},${Math.round(sg * 255)},${Math.round(sb * 255)},${sa})`;
        ctx.lineWidth = text.strokeWidth;
        ctx.lineJoin = 'round';
        if (text.letterSpacing !== 0) {
          drawTextWithSpacing(ctx, line, x, y, text.letterSpacing, 'stroke');
        } else {
          ctx.strokeText(line, x, y);
        }
      }

      ctx.fillStyle = fillPaint;
      if (text.letterSpacing !== 0) {
        drawTextWithSpacing(ctx, line, x, y, text.letterSpacing, 'fill');
      } else {
        ctx.fillText(line, x, y);
      }

      if (text.underline || text.strikethrough) {
        ctx.fillStyle = fillPaint;
        if (text.underline) {
          const uy = y + text.fontSize * 1.1;
          ctx.fillRect(x, uy, lineW, Math.max(1, text.fontSize * 0.06));
        }
        if (text.strikethrough) {
          const sy = y + text.fontSize * 0.55;
          ctx.fillRect(x, sy, lineW, Math.max(1, text.fontSize * 0.06));
        }
      }
    }

    if ((padX === 0 && padY === 0) || attempt >= 2 || !rasterBorderHasInk(ctx, rasterWidth, rasterHeight)) break;
    const grow = Math.max(2, Math.ceil(text.fontSize * 0.02));
    padX += grow + Math.ceil(Math.abs(tan) * grow);
    padY += grow;
  }

  const bitmap = canvas.transferToImageBitmap();
  const entry: CachedTextEntry = { bitmap, width: rasterWidth, height: rasterHeight, key, padX, padY };

  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      const old = cache.get(firstKey);
      if (old) old.bitmap.close();
      cache.delete(firstKey);
    }
  }
  cache.set(key, entry);

  return entry;
}

function drawTextWithSpacing(
  ctx: OffscreenCanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  mode: 'fill' | 'stroke'
) {
  let curX = x;
  for (let i = 0; i < text.length; i++) {
    if (mode === 'fill') {
      ctx.fillText(text[i], curX, y);
    } else {
      ctx.strokeText(text[i], curX, y);
    }
    curX += ctx.measureText(text[i]).width + spacing;
  }
}

export function clearTextCache(): void {
  for (const entry of cache.values()) {
    entry.bitmap.close();
  }
  cache.clear();
}
