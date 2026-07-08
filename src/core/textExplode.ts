import type { ResolvedText, TextAlign, TextLayer } from './types';
import { evaluateNumber, evaluateVec2 } from './interpolation';
import { getTextLayout, measureText, measureStringWidth, measureAdvance } from '../engine/textAtlas';

export type SplitMode = 'character' | 'word' | 'line' | 'paragraph';

export interface ExplodeElement {
  index: number;
  content: string;
  deltaX: number;
  deltaY: number;
}

function lineStartX(align: TextAlign, canvasWidth: number, padding: number, lineW: number): number {
  if (align === 'center') return (canvasWidth - lineW) / 2;
  if (align === 'right') return canvasWidth - padding - lineW;
  return padding;
}

function resolveTextAt(layer: TextLayer, frame: number, content: string): ResolvedText {
  const span = layer.content.spans[0];
  const style = span?.style;
  const bb = layer.layoutConfig.boundingBox;
  const mode: 'point' | 'box' = bb.type === 'auto' ? 'point' : 'box';
  const boxWidth = bb.type === 'fixed' ? bb.width : bb.type === 'fixedWidth' ? bb.width : 300;
  const boxHeight = bb.type === 'fixed' ? bb.height : 200;

  return {
    content,
    mode,
    boxWidth,
    boxHeight,
    fontFamily: style?.fontFamily ?? 'Inter',
    fontWeight: style?.fontWeight ?? 400,
    fontStyle: style?.fontStyle ?? 'normal',
    fontSize: evaluateNumber(layer.animOverrides.fontSize, frame),
    lineHeight: evaluateNumber(layer.animOverrides.lineHeight, frame),
    letterSpacing: evaluateNumber(layer.animOverrides.letterSpacing, frame),
    fillColor: style?.color ?? [1, 1, 1, 1],
    strokeColor: style?.strokeColor ?? [0, 0, 0, 0],
    strokeWidth: evaluateNumber(layer.animOverrides.strokeWidth, frame),
    textAlign: layer.layoutConfig.horizontalAlign,
    underline: style?.underline ?? false,
    strikethrough: style?.strikethrough ?? false,
    measuredWidth: 0,
    measuredHeight: 0,
  };
}

interface RawPiece {
  content: string;   // full (possibly multi-line) text of the element
  firstLine: string; // first visual line of the element
  lineIndex: number; // index of the element's first line in the original layout
  charOffset: number; // start offset of the element within that line
}

function splitPieces(lines: string[], mode: SplitMode): RawPiece[] {
  const pieces: RawPiece[] = [];

  if (mode === 'character') {
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      for (let off = 0; off < line.length; off++) {
        const ch = line[off];
        if (/\s/.test(ch)) continue; // measure spaces as advance, never emit them
        pieces.push({ content: ch, firstLine: ch, lineIndex: li, charOffset: off });
      }
    }
    return pieces;
  }

  if (mode === 'word') {
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const re = /\S+/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        pieces.push({ content: m[0], firstLine: m[0], lineIndex: li, charOffset: m.index });
      }
    }
    return pieces;
  }

  if (mode === 'line') {
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      if (line.trim().length === 0) continue;
      pieces.push({ content: line, firstLine: line, lineIndex: li, charOffset: 0 });
    }
    return pieces;
  }

  // paragraph: group consecutive non-blank lines, blank lines separate groups.
  let group: string[] = [];
  let groupStart = 0;
  const flush = () => {
    if (group.length > 0) {
      pieces.push({
        content: group.join('\n'),
        firstLine: group[0],
        lineIndex: groupStart,
        charOffset: 0,
      });
      group = [];
    }
  };
  for (let li = 0; li < lines.length; li++) {
    if (lines[li].trim().length === 0) {
      flush();
    } else {
      if (group.length === 0) groupStart = li;
      group.push(lines[li]);
    }
  }
  flush();
  return pieces;
}

// Compute, for the given split mode, the content + local position delta for
// every generated clip. The delta is measured from the original layer's local
// position so that each clip renders exactly where its glyphs sat inside the
// source layer at `frame`. Returns null when nothing measurable can be made.
export function computeExplodeElements(
  layer: TextLayer,
  mode: SplitMode,
  frame: number,
): ExplodeElement[] | null {
  if (layer.type !== 'text') return null;
  const fullText = layer.content.spans.map((s) => s.text).join('');
  if (fullText.trim().length === 0) return null;

  const orig = resolveTextAt(layer, frame, fullText);
  const origLayout = getTextLayout(orig);
  const W0 = origLayout.canvasWidth;
  const H0 = origLayout.canvasHeight;
  const padOrig = origLayout.padding;
  const lineHeightPx = origLayout.lineHeightPx;
  if (!Number.isFinite(W0) || !Number.isFinite(H0) || W0 <= 0 || H0 <= 0) return null;

  const pieces = splitPieces(origLayout.lines, mode);
  if (pieces.length === 0) return null;

  const align = orig.textAlign;
  const scale = evaluateVec2(layer.transform.scale, frame);
  const rot = (evaluateNumber(layer.transform.rotation, frame) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);

  const elements: ExplodeElement[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const origLine = origLayout.lines[piece.lineIndex] ?? piece.firstLine;
    const origLineW = measureStringWidth(orig, origLine);
    const lineX = lineStartX(align, W0, padOrig, origLineW);
    const elementStartX = lineX + measureAdvance(orig, origLine, piece.charOffset);
    const yTop = padOrig + piece.lineIndex * lineHeightPx;

    // The element's own tightly-wrapped canvas (always point mode).
    const elResolved = resolveTextAt(layer, frame, piece.content);
    elResolved.mode = 'point';
    const elSize = measureText(elResolved);
    const ownW = elSize.width;
    const ownH = elSize.height;
    const padOwn = 2; // POINT_PADDING
    const firstLineW = measureStringWidth(elResolved, piece.firstLine);
    const xOwn = lineStartX(align, ownW, padOwn, firstLineW);
    const yOwn = padOwn;

    // Pixel-correspondence between the glyph's top-left in the original canvas
    // and in the element's own canvas. Canvas centers (W0/2, ownW/2) appear
    // because each quad is centered at its layer position.
    const dxCanvas = (elementStartX - W0 / 2) - (xOwn - ownW / 2);
    const dyCanvas = (yTop - H0 / 2) - (yOwn - ownH / 2);

    const sx = scale[0] * dxCanvas;
    const sy = scale[1] * dyCanvas;
    const deltaX = sx * cos - sy * sin;
    const deltaY = sx * sin + sy * cos;

    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return null;

    elements.push({ index: i, content: piece.content, deltaX, deltaY });
  }

  return elements;
}
