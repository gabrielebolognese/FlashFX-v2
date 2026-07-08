import type { Vec4 } from '../core/types';

export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export interface TextSpan {
  text: string;
  style: TextSpanStyle;
}

export interface TextSpanStyle {
  fontFamily: string;
  fontWeight: FontWeight;
  fontStyle: 'normal' | 'italic';
  fontSize: number;
  color: Vec4;
  letterSpacing: number;
  lineHeight: number;
  strokeColor: Vec4;
  strokeWidth: number;
  underline: boolean;
  strikethrough: boolean;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

export interface TextContent {
  spans: TextSpan[];
}

export type TextBoundingBox =
  | { type: 'auto' }
  | { type: 'fixed'; width: number; height: number }
  | { type: 'fixedWidth'; width: number };

export interface TextLayoutConfig {
  boundingBox: TextBoundingBox;
  horizontalAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  overflow: 'visible' | 'clip' | 'truncate';
  baselineShift: number;
  perGlyphAnimation: boolean;
}

export interface MeasuredGlyphRect {
  x: number;
  y: number;
  width: number;
  height: number;
  char: string;
}

export interface MeasuredSpan {
  text: string;
  style: TextSpanStyle;
  x: number;
  glyphRects: MeasuredGlyphRect[];
}

export interface MeasuredLine {
  spans: MeasuredSpan[];
  baseline: number;
  lineWidth: number;
}

export interface TextMeasurement {
  lines: MeasuredLine[];
  totalWidth: number;
  totalHeight: number;
}

export function createDefaultTextSpanStyle(): TextSpanStyle {
  return {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontStyle: 'normal',
    fontSize: 48,
    color: [1, 1, 1, 1],
    letterSpacing: 0,
    lineHeight: 1.2,
    strokeColor: [0, 0, 0, 0],
    strokeWidth: 0,
    underline: false,
    strikethrough: false,
    textTransform: 'none',
  };
}

export function createDefaultTextContent(text = 'Text'): TextContent {
  return {
    spans: [{ text, style: createDefaultTextSpanStyle() }],
  };
}

export function createDefaultTextLayoutConfig(): TextLayoutConfig {
  return {
    boundingBox: { type: 'auto' },
    horizontalAlign: 'center',
    verticalAlign: 'top',
    overflow: 'visible',
    baselineShift: 0,
    perGlyphAnimation: false,
  };
}

export function getFullText(content: TextContent): string {
  return content.spans.map((s) => s.text).join('');
}

export function applyTextTransform(text: string, transform: TextSpanStyle['textTransform']): string {
  switch (transform) {
    case 'uppercase': return text.toUpperCase();
    case 'lowercase': return text.toLowerCase();
    case 'capitalize': return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default: return text;
  }
}
