import type { TextSpan, TextSpanStyle } from './types';

export function applyStyleToRange(
  spans: TextSpan[],
  start: number,
  end: number,
  styleDelta: Partial<TextSpanStyle>
): TextSpan[] {
  if (start >= end) return spans;

  const chars: { char: string; style: TextSpanStyle }[] = [];
  for (const span of spans) {
    for (const char of span.text) {
      chars.push({ char, style: { ...span.style } });
    }
  }

  if (start < 0) start = 0;
  if (end > chars.length) end = chars.length;

  for (let i = start; i < end; i++) {
    chars[i].style = { ...chars[i].style, ...styleDelta };
  }

  return compressToSpans(chars);
}

export function insertTextAtPosition(
  spans: TextSpan[],
  position: number,
  text: string,
  style: TextSpanStyle
): TextSpan[] {
  const chars: { char: string; style: TextSpanStyle }[] = [];
  for (const span of spans) {
    for (const char of span.text) {
      chars.push({ char, style: span.style });
    }
  }

  const insertChars = text.split('').map((char) => ({ char, style }));
  chars.splice(position, 0, ...insertChars);

  return compressToSpans(chars);
}

export function deleteTextRange(
  spans: TextSpan[],
  start: number,
  end: number
): TextSpan[] {
  const chars: { char: string; style: TextSpanStyle }[] = [];
  for (const span of spans) {
    for (const char of span.text) {
      chars.push({ char, style: span.style });
    }
  }

  chars.splice(start, end - start);
  if (chars.length === 0) {
    return [{ text: '', style: spans[0]?.style ?? spans[spans.length - 1]?.style }];
  }

  return compressToSpans(chars);
}

function stylesEqual(a: TextSpanStyle, b: TextSpanStyle): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontWeight === b.fontWeight &&
    a.fontStyle === b.fontStyle &&
    a.fontSize === b.fontSize &&
    a.letterSpacing === b.letterSpacing &&
    a.lineHeight === b.lineHeight &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.textTransform === b.textTransform &&
    a.strokeWidth === b.strokeWidth &&
    a.color[0] === b.color[0] && a.color[1] === b.color[1] &&
    a.color[2] === b.color[2] && a.color[3] === b.color[3] &&
    a.strokeColor[0] === b.strokeColor[0] && a.strokeColor[1] === b.strokeColor[1] &&
    a.strokeColor[2] === b.strokeColor[2] && a.strokeColor[3] === b.strokeColor[3]
  );
}

function compressToSpans(chars: { char: string; style: TextSpanStyle }[]): TextSpan[] {
  if (chars.length === 0) return [];

  const spans: TextSpan[] = [];
  let currentText = chars[0].char;
  let currentStyle = chars[0].style;

  for (let i = 1; i < chars.length; i++) {
    if (stylesEqual(chars[i].style, currentStyle)) {
      currentText += chars[i].char;
    } else {
      spans.push({ text: currentText, style: currentStyle });
      currentText = chars[i].char;
      currentStyle = chars[i].style;
    }
  }
  spans.push({ text: currentText, style: currentStyle });

  return spans;
}

export function compressSpans(spans: TextSpan[]): TextSpan[] {
  if (spans.length <= 1) return spans;
  const result: TextSpan[] = [{ ...spans[0] }];
  for (let i = 1; i < spans.length; i++) {
    const last = result[result.length - 1];
    if (stylesEqual(last.style, spans[i].style)) {
      last.text += spans[i].text;
    } else {
      result.push({ ...spans[i] });
    }
  }
  return result;
}
