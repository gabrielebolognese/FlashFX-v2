import type { ResolvedText, TextGradientFill } from '../core/types';

interface CachedTextEntry {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  key: string;
}

export interface TextLayout {
  lines: string[];
  lineHeightPx: number;
  canvasWidth: number;
  canvasHeight: number;
  padding: number;
}

const cache = new Map<string, CachedTextEntry>();
const MAX_CACHE_SIZE = 256;

const POINT_PADDING = 2;
const DESCENDER_RATIO = 0.25;

// Bumped once the bundled fonts finish loading (see engine/fonts.ts). Folded into the cache
// key so text rasterized against the sans-serif fallback (pre-load) is re-rasterized against
// the real face afterwards — both this bitmap cache and the renderer's key-based GPU texture
// cache miss and rebuild.
let fontEpoch = 0;
export function bumpFontEpoch(): void {
  fontEpoch++;
  clearTextCache();
}

function fillKey(text: ResolvedText): string {
  const f = text.fill;
  if (!f) return '';
  return `${f.kind}:${f.angle}:${f.stops.map((s) => `${s.color.join(',')}@${s.position}x${s.opacity}`).join(';')}`;
}

export function textCacheKey(text: ResolvedText): string {
  return `${fontEpoch}|${text.content}|${text.fontFamily}|${text.fontWeight}|${text.fontStyle}|${text.fontSize}|${text.lineHeight}|${text.letterSpacing}|${text.textAlign}|${text.fillColor.join(',')}|${fillKey(text)}|${text.strokeColor.join(',')}|${text.strokeWidth}|${text.underline}|${text.strikethrough}|${text.mode}|${text.boxWidth}|${text.boxHeight}`;
}

export function buildFontString(text: ResolvedText): string {
  const style = text.fontStyle === 'italic' ? 'italic' : 'normal';
  return `${style} ${text.fontWeight} ${text.fontSize}px "${text.fontFamily}", sans-serif`;
}

/** Build a Canvas gradient spanning the text box, from a TextGradientFill descriptor. */
function buildTextGradient(
  ctx: OffscreenCanvasRenderingContext2D,
  fill: TextGradientFill,
  w: number,
  h: number,
): CanvasGradient {
  const cx = w / 2;
  const cy = h / 2;
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

// Measurement only needs a 2D context — reuse a single scratch canvas/context
// across all calls instead of allocating a fresh OffscreenCanvas per text layer
// per frame (a measurable per-frame cost). Every call sets ctx.font before
// measuring, so there's no stale-state hazard from sharing it.
let _measureCtx: OffscreenCanvasRenderingContext2D | null = null;
function measureCtx(): OffscreenCanvasRenderingContext2D {
  if (!_measureCtx) _measureCtx = new OffscreenCanvas(1, 1).getContext('2d')!;
  return _measureCtx;
}

export function measureText(text: ResolvedText): { width: number; height: number } {
  const layout = computeLayout(measureCtx(), text);
  return { width: layout.canvasWidth, height: layout.canvasHeight };
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

// X advance to reach character index `count` within `line`, mirroring how
// drawTextWithSpacing advances curX (each glyph adds its width + spacing).
export function measureAdvance(text: ResolvedText, line: string, count: number): number {
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext('2d')!;
  ctx.font = buildFontString(text);
  if (text.letterSpacing === 0) return ctx.measureText(line.slice(0, count)).width;
  let x = 0;
  for (let i = 0; i < count; i++) x += ctx.measureText(line[i]).width + text.letterSpacing;
  return x;
}

export function renderTextToCanvas(text: ResolvedText): CachedTextEntry | null {
  const key = textCacheKey(text);
  const cached = cache.get(key);
  if (cached) return cached;

  const measureCanvas = new OffscreenCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d')!;
  const layout = computeLayout(measureCtx, text);

  const { lines, lineHeightPx, canvasWidth, canvasHeight, padding } = layout;

  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d')!;

  ctx.font = buildFontString(text);
  ctx.textBaseline = 'top';

  const [fr, fg, fb, fa] = text.fillColor;
  const solidFill = `rgba(${Math.round(fr * 255)},${Math.round(fg * 255)},${Math.round(fb * 255)},${fa})`;
  // Gradient fills paint across the whole box (layer space) so they don't swim per glyph.
  const fillPaint: string | CanvasGradient = text.fill
    ? buildTextGradient(ctx, text.fill, canvasWidth, canvasHeight)
    : solidFill;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = padding + i * lineHeightPx;

    const lineW = lineWidth(ctx, line, text.letterSpacing);
    let x = padding;
    if (text.textAlign === 'center') {
      x = (canvasWidth - lineW) / 2;
    } else if (text.textAlign === 'right') {
      x = canvasWidth - padding - lineW;
    }

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

  const bitmap = canvas.transferToImageBitmap();
  const entry: CachedTextEntry = { bitmap, width: canvasWidth, height: canvasHeight, key };

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
