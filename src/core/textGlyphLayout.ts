// B45 / B36 - where each laid-out LINE of a text sits in its content string, and where a line starts
// inside the layer raster. Pure (no canvas): the canvas word-wrap (engine/textAtlas.ts layoutLines)
// produces the line strings; this maps them back onto content indices so the per-glyph stamp path
// (core/interpolation.ts expandTextGlyphs) can place every character of a multi-line, wrapped, fixed-box
// or fixed-width text exactly where the whole-layer raster draws it.

import type { TextAlign } from './types';

/** One laid-out line: content indices [start, end) (whitespace dropped at a wrap is in no line). */
export interface TextLineRange {
  start: number;
  end: number;
}

/**
 * Map the layout's line strings onto the content. Hard breaks ('\n') split paragraphs; the wrapper
 * only trims whitespace at the wrap points, so every line is a contiguous substring of its paragraph,
 * found in order. Returns null when a line cannot be located (a layout this mapping does not
 * understand) - the caller then keeps the whole-layer render rather than misplace glyphs.
 */
export function mapLinesToContent(content: string, lines: readonly string[]): TextLineRange[] | null {
  const out: TextLineRange[] = [];
  let cursor = 0;
  let li = 0;
  const paragraphs = content.split('\n');
  for (const para of paragraphs) {
    const paraStart = cursor;
    let inPara = 0;
    // Lines belonging to this paragraph: consume until the paragraph is exhausted. An empty
    // paragraph lays out as exactly one empty line.
    if (para.length === 0) {
      if (li >= lines.length || lines[li] !== '') return null;
      out.push({ start: paraStart, end: paraStart });
      li++;
    } else {
      while (li < lines.length) {
        const line = lines[li];
        const at = line.length === 0 ? inPara : para.indexOf(line, inPara);
        if (at < 0) break;
        out.push({ start: paraStart + at, end: paraStart + at + line.length });
        li++;
        inPara = at + line.length;
        // The rest of the paragraph is whitespace only: this paragraph is done.
        if (para.slice(inPara).trim() === '') break;
      }
      if (out.length === 0 || out[out.length - 1].start < paraStart) return null;
    }
    cursor += para.length + 1; // + the '\n'
  }
  return li === lines.length ? out : null;
}

/** X of a line's left edge inside the layer raster (mirrors renderTextToCanvas's alignment). */
export function lineStartX(align: TextAlign | string, canvasWidth: number, padding: number, lineWidth: number): number {
  return align === 'center' ? (canvasWidth - lineWidth) / 2
    : align === 'right' ? canvasWidth - padding - lineWidth
    : padding;
}
