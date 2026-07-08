export type { TextSpan, TextSpanStyle, TextContent, TextLayoutConfig, TextBoundingBox, FontWeight, MeasuredLine, MeasuredSpan, MeasuredGlyphRect, TextMeasurement } from './types';
export { createDefaultTextSpanStyle, createDefaultTextContent, createDefaultTextLayoutConfig, getFullText, applyTextTransform } from './types';
export { getTextMeasurement, invalidateMeasurementCache } from './measurement';
export { loadFont, isFontReady, isFontLoading, onFontLoaded, ALL_FONTS, SYSTEM_FONTS, GOOGLE_FONTS } from './fontRegistry';
export { applyStyleToRange, insertTextAtPosition, deleteTextRange, compressSpans } from './spanEditor';
