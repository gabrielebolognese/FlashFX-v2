import type { TextContent, TextLayoutConfig, TextSpanStyle, MeasuredLine, MeasuredSpan, MeasuredGlyphRect, TextMeasurement } from './types';
import { applyTextTransform } from './types';

const LRU_MAX = 200;

const cache = new Map<string, TextMeasurement>();

function hashInputs(content: TextContent, layout: TextLayoutConfig): string {
  const spans = content.spans.map((s) => {
    const st = s.style;
    return `${applyTextTransform(s.text, st.textTransform)}|${st.fontFamily}|${st.fontWeight}|${st.fontStyle}|${st.fontSize}|${st.letterSpacing}|${st.lineHeight}`;
  }).join(';;');
  const bb = layout.boundingBox;
  const bbKey = bb.type === 'auto' ? 'auto' : bb.type === 'fixed' ? `fixed:${bb.width}:${bb.height}` : `fw:${bb.width}`;
  return `${spans}||${bbKey}|${layout.horizontalAlign}|${layout.perGlyphAnimation}`;
}

export function getTextMeasurement(content: TextContent, layout: TextLayoutConfig): TextMeasurement {
  const key = hashInputs(content, layout);
  const cached = cache.get(key);
  if (cached) return cached;

  const result = measure(content, layout);

  if (cache.size >= LRU_MAX) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, result);
  return result;
}

export function invalidateMeasurementCache(): void {
  cache.clear();
}

function measure(content: TextContent, layout: TextLayoutConfig): TextMeasurement {
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext('2d')!;

  const fullText = content.spans.map((s) => applyTextTransform(s.text, s.style.textTransform)).join('');
  const primaryStyle = content.spans[0]?.style;
  if (!primaryStyle) return { lines: [], totalWidth: 0, totalHeight: 0 };

  const lineHeightPx = primaryStyle.fontSize * primaryStyle.lineHeight;
  const maxWidth = getMaxWidth(layout);

  const rawLines = fullText.split('\n');
  const measuredLines: MeasuredLine[] = [];

  ctx.font = buildFont(primaryStyle);

  for (const rawLine of rawLines) {
    if (maxWidth !== null) {
      const wrapped = wrapLine(ctx, rawLine, maxWidth, primaryStyle.letterSpacing);
      for (const wl of wrapped) {
        measuredLines.push(measureLine(ctx, wl, primaryStyle, layout.perGlyphAnimation));
      }
    } else {
      measuredLines.push(measureLine(ctx, rawLine, primaryStyle, layout.perGlyphAnimation));
    }
  }

  let totalWidth = 0;
  for (const line of measuredLines) {
    totalWidth = Math.max(totalWidth, line.lineWidth);
  }

  const descenderExtra = primaryStyle.fontSize * 0.25;
  const totalHeight = measuredLines.length * lineHeightPx + descenderExtra;

  for (let i = 0; i < measuredLines.length; i++) {
    measuredLines[i].baseline = i * lineHeightPx;
  }

  return { lines: measuredLines, totalWidth, totalHeight };
}

function getMaxWidth(layout: TextLayoutConfig): number | null {
  if (layout.boundingBox.type === 'fixed') return layout.boundingBox.width;
  if (layout.boundingBox.type === 'fixedWidth') return layout.boundingBox.width;
  return null;
}

function buildFont(style: TextSpanStyle): string {
  const fs = style.fontStyle === 'italic' ? 'italic' : 'normal';
  return `${fs} ${style.fontWeight} ${style.fontSize}px "${style.fontFamily}", sans-serif`;
}

function measureLineWidth(ctx: OffscreenCanvasRenderingContext2D, line: string, spacing: number): number {
  if (spacing === 0) return ctx.measureText(line).width;
  let w = 0;
  for (let i = 0; i < line.length; i++) {
    w += ctx.measureText(line[i]).width + (i < line.length - 1 ? spacing : 0);
  }
  return w;
}

function wrapLine(ctx: OffscreenCanvasRenderingContext2D, line: string, maxWidth: number, spacing: number): string[] {
  if (line.length === 0) return [''];
  const words = line.split(/(\s+)/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current + word;
    if (measureLineWidth(ctx, test, spacing) > maxWidth && current.length > 0) {
      lines.push(current.trimEnd());
      current = word.trimStart();
    } else {
      current = test;
    }
  }
  lines.push(current.trimEnd());
  return lines;
}

function measureLine(
  ctx: OffscreenCanvasRenderingContext2D,
  line: string,
  style: TextSpanStyle,
  perGlyph: boolean
): MeasuredLine {
  const lineW = measureLineWidth(ctx, line, style.letterSpacing);
  const glyphRects: MeasuredGlyphRect[] = [];

  if (perGlyph && line.length > 0) {
    let x = 0;
    for (let i = 0; i < line.length; i++) {
      const charW = ctx.measureText(line[i]).width;
      glyphRects.push({
        x,
        y: 0,
        width: charW,
        height: style.fontSize,
        char: line[i],
      });
      x += charW + style.letterSpacing;
    }
  }

  const span: MeasuredSpan = { text: line, style, x: 0, glyphRects };
  return { spans: [span], baseline: 0, lineWidth: lineW };
}
